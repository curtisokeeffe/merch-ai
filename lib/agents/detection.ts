import type { ProductRow } from '../db'
import type { CategoryStats } from './types'

// ── Statistical primitives ────────────────────────────────────────────────────

export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export function mean(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

export function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length)
}

/** z-score of a value within a distribution (how many std deviations from mean) */
export function zScore(value: number, avg: number, sd: number): number {
  if (sd === 0) return 0
  return (value - avg) / sd
}

// ── Dataset-level percentile snapshot ────────────────────────────────────────
// Computed ONCE per run and passed into every agent — avoids recomputation.

export interface DataPercentiles {
  sellThrough: { p10: number; p25: number; p50: number; p75: number; p90: number }
  weeksOfSupply: { p10: number; p25: number; p50: number; p75: number; p90: number }
  price: { mean: number; p25: number; p75: number }
  avgQty: { mean: number; p75: number }
  totalRevenue: number
  totalInventoryValue: number
  categoryRevenue: Record<string, number>
}

export function buildPercentiles(products: ProductRow[]): DataPercentiles {
  const sts  = products.map((p) => p.sell_through_rate)
  const wos  = products.map((p) => p.weeks_of_supply)
  const pris = products.map((p) => p.retail_price)
  const qtys = products.map((p) => p.avg_qty_per_tx)

  const catRevenue: Record<string, number> = {}
  for (const p of products) {
    catRevenue[p.category] = (catRevenue[p.category] ?? 0) + p.total_revenue
  }

  return {
    sellThrough: {
      p10: percentile(sts, 10),
      p25: percentile(sts, 25),
      p50: percentile(sts, 50),
      p75: percentile(sts, 75),
      p90: percentile(sts, 90),
    },
    weeksOfSupply: {
      p10: percentile(wos, 10),
      p25: percentile(wos, 25),
      p50: percentile(wos, 50),
      p75: percentile(wos, 75),
      p90: percentile(wos, 90),
    },
    price: {
      mean: mean(pris),
      p25: percentile(pris, 25),
      p75: percentile(pris, 75),
    },
    avgQty: {
      mean: mean(qtys),
      p75: percentile(qtys, 75),
    },
    totalRevenue: products.reduce((s, p) => s + p.total_revenue, 0),
    totalInventoryValue: products.reduce((s, p) => s + p.inventory_value, 0),
    categoryRevenue: catRevenue,
  }
}

// ── Category-level stats for peer comparison ──────────────────────────────────
// Allows agents to see how a SKU compares within its own category (z-score),
// not just against the global distribution.

export function buildCategoryStats(products: ProductRow[]): Map<string, CategoryStats> {
  const map = new Map<string, CategoryStats>()

  const byCategory = new Map<string, ProductRow[]>()
  for (const p of products) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, [])
    byCategory.get(p.category)!.push(p)
  }

  for (const [category, catProducts] of byCategory) {
    const sts = catProducts.map((p) => p.sell_through_rate)
    const woss = catProducts.map((p) => p.weeks_of_supply)

    map.set(category, {
      category,
      count: catProducts.length,
      avg_sell_through: mean(sts),
      avg_weeks_of_supply: mean(woss),
      st_stddev: stdDev(sts),
      wos_stddev: stdDev(woss),
      p25_sell_through: percentile(sts, 25),
      p75_sell_through: percentile(sts, 75),
      p25_wos: percentile(woss, 25),
      p75_wos: percentile(woss, 75),
    })
  }

  return map
}

// ── Urgency scoring — 0–100, deterministic ────────────────────────────────────

export function urgencyScore(
  product: ProductRow,
  dp: DataPercentiles
): number {
  let score = 0

  // Sell-through component (low ST = more urgent)
  if (product.sell_through_rate <= dp.sellThrough.p10) score += 40
  else if (product.sell_through_rate <= dp.sellThrough.p25) score += 25
  else if (product.sell_through_rate <= dp.sellThrough.p50) score += 10

  // Weeks-of-supply component (high WoS = more urgent)
  if (product.weeks_of_supply >= dp.weeksOfSupply.p90) score += 40
  else if (product.weeks_of_supply >= dp.weeksOfSupply.p75) score += 25
  else if (product.weeks_of_supply >= dp.weeksOfSupply.p50) score += 10

  // Inventory value at stake (more value = higher impact)
  const ivShare = dp.totalInventoryValue > 0
    ? product.inventory_value / dp.totalInventoryValue
    : 0
  score += Math.min(20, Math.round(ivShare * 200))

  return Math.min(100, score)
}

/** Category-relative urgency bonus: how bad is this SKU vs its category peers?
 *  Returns 0–15 additional urgency points based on category z-score. */
export function categoryUrgencyBonus(
  product: ProductRow,
  catStats: CategoryStats | undefined
): number {
  if (!catStats || catStats.count < 3) return 0

  const stZ = zScore(product.sell_through_rate, catStats.avg_sell_through, catStats.st_stddev)
  const wosZ = zScore(product.weeks_of_supply, catStats.avg_weeks_of_supply, catStats.wos_stddev)

  let bonus = 0
  // SKU's ST is ≥1 std below its category mean → meaningfully worse than peers
  if (stZ < -1.0) bonus += 8
  else if (stZ < -0.5) bonus += 4

  // SKU's WoS is ≥1 std above its category mean → sitting much longer than peers
  if (wosZ > 1.0) bonus += 7
  else if (wosZ > 0.5) bonus += 3

  return Math.min(15, bonus)
}
