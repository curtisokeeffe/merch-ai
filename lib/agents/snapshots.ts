/**
 * Snapshots — periodic product state capture for trend detection
 *
 * Every agent run takes a snapshot of live_products (at most once per hour).
 * On subsequent runs, trends are computed by diffing current state vs prior snapshot.
 *
 * Trend computation:
 *   - Velocity   (1st derivative): change per day between snapshots
 *   - Acceleration (2nd derivative): change in velocity between two snapshot windows
 *   - Projection (30d forecast):   current + velocity * 30, clamped to 0–100
 *   - Early warning: true when projected trajectory will cross a key threshold
 *
 * When live data is connected, trends will naturally reflect real sales velocity.
 */

import type { Database } from 'better-sqlite3'
import type { ProductRow } from '../db'
import type { TrendData } from './types'

const SNAPSHOT_MIN_INTERVAL_MS = 60 * 60 * 1000  // take at most one snapshot per hour

interface SnapshotRow {
  snapshot_at: string
  sku_id: string
  sell_through_rate: number
  current_stock: number
  weeks_of_supply: number
  retail_price: number
  inventory_value: number
  status: string
}

// ── Snapshot management ───────────────────────────────────────────────────────

export function maybeSnapshot(db: Database, products: ProductRow[]): void {
  const latest = db
    .prepare("SELECT snapshot_at FROM product_snapshots ORDER BY snapshot_at DESC LIMIT 1")
    .get() as { snapshot_at: string } | undefined

  if (latest) {
    const msSince = Date.now() - new Date(latest.snapshot_at).getTime()
    if (msSince < SNAPSHOT_MIN_INTERVAL_MS) return
  }

  const now = new Date().toISOString()
  const insert = db.prepare(`
    INSERT OR REPLACE INTO product_snapshots
      (snapshot_at, sku_id, sell_through_rate, current_stock, weeks_of_supply, retail_price, inventory_value, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  db.transaction(() => {
    for (const p of products) {
      insert.run(now, p.sku_id, p.sell_through_rate, p.current_stock, p.weeks_of_supply, p.retail_price, p.inventory_value, p.status)
    }
  })()
}

// ── Trend computation ─────────────────────────────────────────────────────────
// Uses up to two prior snapshots to compute velocity + acceleration.

export function buildTrendMap(
  db: Database,
  products: ProductRow[]
): Map<string, TrendData> {
  const map = new Map<string, TrendData>()

  for (const product of products) {
    // Get the two most recent snapshots before now (skip last 30 min to avoid self-diff)
    const rows = db.prepare(`
      SELECT * FROM product_snapshots
      WHERE sku_id = ?
        AND snapshot_at < datetime('now', '-30 minutes')
      ORDER BY snapshot_at DESC
      LIMIT 2
    `).all(product.sku_id) as SnapshotRow[]

    if (rows.length === 0) {
      map.set(product.sku_id, {
        sell_through_velocity: 0,
        sell_through_acceleration: 0,
        stock_velocity: 0,
        wos_trend: 'stable',
        days_since_snapshot: 0,
        has_trend_data: false,
        projected_sell_through_30d: product.sell_through_rate,
        early_warning: false,
      })
      continue
    }

    // ── Window 1: current vs most-recent snapshot ─────────────────────────
    const recent = rows[0]
    const daysSince1 = (Date.now() - new Date(recent.snapshot_at).getTime()) / 86_400_000
    const safeDays1 = Math.max(daysSince1, 0.042)

    const stVelocity = (product.sell_through_rate - recent.sell_through_rate) / safeDays1
    const stockVelocity = (product.current_stock - recent.current_stock) / safeDays1

    let wosTrend: TrendData['wos_trend'] = 'stable'
    const wosDelta = product.weeks_of_supply - recent.weeks_of_supply
    if (wosDelta < -0.5) wosTrend = 'improving'
    else if (wosDelta > 0.5) wosTrend = 'worsening'

    // ── Window 2: most-recent vs older snapshot (acceleration) ───────────
    let acceleration = 0
    if (rows.length >= 2) {
      const older = rows[1]
      const daysBetween = (new Date(recent.snapshot_at).getTime() - new Date(older.snapshot_at).getTime()) / 86_400_000
      const safeDaysBetween = Math.max(daysBetween, 0.042)
      const priorVelocity = (recent.sell_through_rate - older.sell_through_rate) / safeDaysBetween
      acceleration = (stVelocity - priorVelocity) / Math.max(daysSince1, 0.042)
    }

    // ── 30-day projection ─────────────────────────────────────────────────
    // Use velocity + half the acceleration (conservative: don't assume it persists fully)
    const projected30d = Math.max(0, Math.min(100,
      product.sell_through_rate + stVelocity * 30 + 0.5 * acceleration * 30 * 30
    ))

    // ── Early warning ─────────────────────────────────────────────────────
    // Warn if currently OK but projected to cross a bad threshold within 30 days
    const ST_LOW_THRESHOLD = 35   // below this = slow mover concern
    const WOS_HIGH_THRESHOLD = 20 // above this = overstock concern
    const earlyWarning = (
      // ST will decline significantly from OK to bad
      (product.sell_through_rate >= ST_LOW_THRESHOLD && projected30d < ST_LOW_THRESHOLD && stVelocity < 0) ||
      // Stock depleting and will cause stockout
      (product.weeks_of_supply <= 4 && stockVelocity < -5) ||
      // Sell-through declining fast (acceleration negative + already slow)
      (acceleration < -0.05 && product.sell_through_rate < 50)
    )

    map.set(product.sku_id, {
      sell_through_velocity: stVelocity,
      sell_through_acceleration: Math.round(acceleration * 1000) / 1000,
      stock_velocity: stockVelocity,
      wos_trend: wosTrend,
      days_since_snapshot: Math.round(daysSince1 * 10) / 10,
      has_trend_data: true,
      projected_sell_through_30d: Math.round(projected30d * 10) / 10,
      early_warning: earlyWarning,
    })
  }

  return map
}

// ── Urgency modifier based on trend ──────────────────────────────────────────
// Returns adjustment (-20 to +25) to apply on top of base urgency score.
// Acceleration bumps the modifier further — a decelerating decline is more
// urgent than a stable one.

export function trendUrgencyModifier(trend: TrendData | null): number {
  if (!trend || !trend.has_trend_data) return 0

  let modifier = 0

  // Declining sell-through velocity → more urgent
  if (trend.sell_through_velocity < -1) modifier += 15
  else if (trend.sell_through_velocity < -0.2) modifier += 8

  // Deceleration (2nd derivative negative) on top of a declining velocity → amplify
  if (trend.sell_through_acceleration < -0.05 && trend.sell_through_velocity < 0) {
    modifier += 8
  }

  // Early warning: trajectory will cross threshold within 30 days
  if (trend.early_warning) modifier += 5

  // Weeks-of-supply worsening → more urgent
  if (trend.wos_trend === 'worsening') modifier += 10
  else if (trend.wos_trend === 'improving') modifier -= 10

  // Sell-through improving with positive acceleration → reduce urgency further
  if (trend.sell_through_velocity > 0.5 && trend.sell_through_acceleration >= 0) modifier -= 10
  else if (trend.sell_through_velocity > 0.5) modifier -= 6

  return Math.max(-20, Math.min(25, modifier))
}
