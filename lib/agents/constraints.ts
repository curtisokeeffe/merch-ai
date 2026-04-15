import type { ProductRow } from '../db'

// ── Business rules (single source of truth) ───────────────────────────────────

export const BUSINESS_RULES = {
  MIN_MARGIN_PCT: 12,          // no action may push gross margin below 12%
  MAX_MARKDOWN_PCT: 30,        // no single markdown may exceed 30%
  MAX_PRICE_INCREASE_PCT: 15,  // no single price increase may exceed 15%
  MIN_PRICE_FLOOR: 4.99,       // no SKU retail price may fall below $4.99
  MIN_STOCK_FOR_ACTION: 1,     // SKU must have at least 1 unit to be actioned
  REAPPLY_COOLDOWN_DAYS: 7,    // same action cannot be re-suggested within 7 days
  MIN_ST_FOR_PRICE_UP: 50,     // sell-through must be ≥50% to allow price increase
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function calcMarginPct(price: number, cost: number): number {
  if (price <= 0) return 0
  return ((price - cost) / price) * 100
}

export function isCoolingDown(lastRunAt: string | null | undefined, days = BUSINESS_RULES.REAPPLY_COOLDOWN_DAYS): boolean {
  if (!lastRunAt) return false
  const msSince = Date.now() - new Date(lastRunAt).getTime()
  return msSince < days * 86_400_000
}

// ── Validators — return array of violation strings (empty = passed) ────────────

export function validateMarkdown(product: ProductRow, markdownPct: number): string[] {
  const violations: string[] = []
  const newPrice = product.retail_price * (1 - markdownPct / 100)
  const newMargin = calcMarginPct(newPrice, product.cost_price)

  if (markdownPct > BUSINESS_RULES.MAX_MARKDOWN_PCT)
    violations.push(`Markdown ${markdownPct}% exceeds ceiling of ${BUSINESS_RULES.MAX_MARKDOWN_PCT}%`)
  if (newMargin < BUSINESS_RULES.MIN_MARGIN_PCT)
    violations.push(`Post-markdown margin ${newMargin.toFixed(1)}% below floor of ${BUSINESS_RULES.MIN_MARGIN_PCT}%`)
  if (newPrice < BUSINESS_RULES.MIN_PRICE_FLOOR)
    violations.push(`Post-markdown price $${newPrice.toFixed(2)} below floor of $${BUSINESS_RULES.MIN_PRICE_FLOOR}`)
  if (product.current_stock < BUSINESS_RULES.MIN_STOCK_FOR_ACTION)
    violations.push(`Stock ${product.current_stock} unit(s) — insufficient for action`)

  return violations
}

export function validatePriceIncrease(product: ProductRow, increasePct: number): string[] {
  const violations: string[] = []

  if (increasePct > BUSINESS_RULES.MAX_PRICE_INCREASE_PCT)
    violations.push(`Increase ${increasePct}% exceeds ceiling of ${BUSINESS_RULES.MAX_PRICE_INCREASE_PCT}%`)
  if (product.sell_through_rate < BUSINESS_RULES.MIN_ST_FOR_PRICE_UP)
    violations.push(`Sell-through ${product.sell_through_rate.toFixed(0)}% too low for price increase (min ${BUSINESS_RULES.MIN_ST_FOR_PRICE_UP}%)`)

  return violations
}

export function validateBundleDiscount(product: ProductRow, discountPct: number): string[] {
  return validateMarkdown(product, discountPct) // same margin/floor rules apply
}
