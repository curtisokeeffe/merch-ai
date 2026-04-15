/**
 * Agent Coordinator — prevents conflicts AND surfaces strategic opportunities
 *
 * Conflict prevention:
 *   - SKU recently marked down  →  block price increase suggestions
 *   - SKU recently priced up    →  block markdown suggestions
 *   - SKU approved < 24h ago    →  block all agents (hard cooldown)
 *
 * Strategic opportunities (new):
 *   Identifies pairs of SKUs or conditions where a complementary action
 *   from a different agent would compound the benefit of a recent one.
 *
 *   Examples:
 *   - SKU was markdowned (price-down) + still high stock → suggest bundle with
 *     a related fast-moving SKU to accelerate clearance
 *   - SKU priced up after low stock → pricing agent should watch for restocking
 *   - Category has mixed fast + slow movers → assortment rebalance opportunity
 */

import type { Database } from 'better-sqlite3'
import type { RecentAction, StrategicOpportunity } from './types'

const HARD_COOLDOWN_HOURS = 24

// Action categories for conflict detection
const MARKDOWN_ACTIONS = new Set(['markdown_10', 'markdown_15', 'markdown_20', 'markdown_25', 'bundle_5', 'bundle_10', 'cat_rebalance_5', 'cat_rebalance_10', 'concentration_rebalance_12'])
const PRICE_UP_ACTIONS = new Set(['price_up_5', 'price_up_8', 'price_up_10', 'loyalty_pricing', 'stockout_price_up_5', 'stockout_price_up_8', 'margin_recovery'])

export type ConflictType = 'all' | 'markdown' | 'price_up'

// ── Build conflict map ────────────────────────────────────────────────────────

export function buildConflictMap(db: Database): Map<string, RecentAction[]> {
  const map = new Map<string, RecentAction[]>()

  const logs = db.prepare(`
    SELECT agent_source, action_type, affected_skus, approved_at
    FROM action_log
    WHERE status = 'approved'
      AND approved_at >= datetime('now', '-30 days')
    ORDER BY approved_at DESC
  `).all() as {
    agent_source: string
    action_type: string
    affected_skus: string
    approved_at: string
  }[]

  for (const log of logs) {
    let skus: string[]
    try { skus = JSON.parse(log.affected_skus) } catch { continue }

    const daysAgo = (Date.now() - new Date(log.approved_at).getTime()) / 86_400_000

    for (const skuId of skus) {
      if (!map.has(skuId)) map.set(skuId, [])
      map.get(skuId)!.push({
        agent_name: log.agent_source,
        action_type: log.action_type,
        approved_at: log.approved_at,
        days_ago: Math.round(daysAgo * 10) / 10,
      })
    }
  }

  return map
}

// ── Conflict check ────────────────────────────────────────────────────────────

export function isConflicted(
  conflictMap: Map<string, RecentAction[]>,
  skuId: string,
  proposedActionType: string
): { blocked: boolean; reason: string } {
  const recentActions = conflictMap.get(skuId)
  if (!recentActions || recentActions.length === 0) {
    return { blocked: false, reason: '' }
  }

  const mostRecent = recentActions[0]
  const hoursAgo = mostRecent.days_ago * 24

  // Hard cooldown — no agent touches a SKU within 24h of any approval
  if (hoursAgo < HARD_COOLDOWN_HOURS) {
    return {
      blocked: true,
      reason: `Hard cooldown: ${mostRecent.agent_name} acted ${hoursAgo.toFixed(1)}h ago (${mostRecent.action_type})`,
    }
  }

  // Directional conflicts
  const proposingMarkdown = MARKDOWN_ACTIONS.has(proposedActionType)
  const proposingPriceUp = PRICE_UP_ACTIONS.has(proposedActionType)

  for (const action of recentActions) {
    if (action.days_ago > 14) continue  // only check last 14 days for directional conflicts

    const actionWasMarkdown = MARKDOWN_ACTIONS.has(action.action_type)
    const actionWasPriceUp = PRICE_UP_ACTIONS.has(action.action_type)

    if (proposingPriceUp && actionWasMarkdown) {
      return {
        blocked: true,
        reason: `Conflict: ${action.agent_name} applied markdown ${action.days_ago}d ago — price increase contradicts this`,
      }
    }

    if (proposingMarkdown && actionWasPriceUp) {
      return {
        blocked: true,
        reason: `Conflict: ${action.agent_name} increased price ${action.days_ago}d ago — markdown contradicts this`,
      }
    }
  }

  return { blocked: false, reason: '' }
}

// ── Strategic opportunities ───────────────────────────────────────────────────
// Looks at recent actions and surfaces complementary next steps.
// These are advisory signals passed into agents, not blocks.

export function buildStrategicOpportunities(
  db: Database,
  conflictMap: Map<string, RecentAction[]>
): Map<string, StrategicOpportunity> {
  const opportunities = new Map<string, StrategicOpportunity>()

  // Look for SKUs that had a markdown 7–30 days ago and still haven't cleared
  // → opportunity for bundle/assortment rebalance to accelerate sell-through
  const recentMarkdowns = db.prepare(`
    SELECT al.agent_source, al.action_type, al.affected_skus, al.approved_at,
           lp.sku_id, lp.sell_through_rate, lp.current_stock, lp.weeks_of_supply,
           lp.status, lp.category
    FROM action_log al
    JOIN live_products lp ON (
      json_extract(al.affected_skus, '$[0]') = lp.sku_id
      OR al.affected_skus LIKE '%' || lp.sku_id || '%'
    )
    WHERE al.status = 'approved'
      AND al.approved_at >= datetime('now', '-30 days')
      AND al.approved_at <= datetime('now', '-7 days')
      AND al.action_type LIKE 'markdown_%'
    ORDER BY al.approved_at DESC
  `).all() as {
    agent_source: string
    action_type: string
    affected_skus: string
    approved_at: string
    sku_id: string
    sell_through_rate: number
    current_stock: number
    weeks_of_supply: number
    status: string
    category: string
  }[]

  for (const row of recentMarkdowns) {
    if (opportunities.has(row.sku_id)) continue

    // Still on markdown and sell-through hasn't improved much
    if (row.status === 'on_markdown' && row.sell_through_rate < 45 && row.current_stock > 10) {
      opportunities.set(row.sku_id, {
        sku_id: row.sku_id,
        opportunity: 'bundle_acceleration',
        suggested_action: 'bundle_5',
        rationale: `Markdown applied ${Math.round((Date.now() - new Date(row.approved_at).getTime()) / 86_400_000)}d ago but sell-through (${row.sell_through_rate.toFixed(0)}%) still slow — bundle discount may accelerate clearance`,
      })
    }
  }

  // Look for SKUs where a price-up happened and stock has stabilised
  // → opportunity for margin recovery monitoring
  const recentPriceUps = db.prepare(`
    SELECT al.action_type, al.affected_skus, al.approved_at,
           lp.sku_id, lp.sell_through_rate, lp.markdown_pct, lp.status
    FROM action_log al
    JOIN live_products lp ON (
      al.affected_skus LIKE '%' || lp.sku_id || '%'
    )
    WHERE al.status = 'approved'
      AND al.approved_at >= datetime('now', '-21 days')
      AND al.approved_at <= datetime('now', '-7 days')
      AND (al.action_type LIKE 'stockout_%' OR al.action_type LIKE 'price_up_%')
    ORDER BY al.approved_at DESC
    LIMIT 20
  `).all() as {
    action_type: string
    affected_skus: string
    approved_at: string
    sku_id: string
    sell_through_rate: number
    markdown_pct: number
    status: string
  }[]

  for (const row of recentPriceUps) {
    if (opportunities.has(row.sku_id)) continue

    // Price was raised, sell-through is still healthy — could continue at higher price
    if (row.sell_through_rate >= 60 && row.status === 'active') {
      opportunities.set(row.sku_id, {
        sku_id: row.sku_id,
        opportunity: 'sustained_demand',
        suggested_action: 'price_up_5',
        rationale: `Price increase applied recently — sell-through (${row.sell_through_rate.toFixed(0)}%) remains strong, demand is price-inelastic`,
      })
    }
  }

  return opportunities
}

// ── Summary of what recently happened to a SKU (for AI context) ──────────────

export function recentActionSummary(
  conflictMap: Map<string, RecentAction[]>,
  skuId: string
): string {
  const actions = conflictMap.get(skuId)
  if (!actions || actions.length === 0) return 'no recent actions'
  return actions
    .slice(0, 3)
    .map((a) => `${a.agent_name}: ${a.action_type} (${a.days_ago}d ago)`)
    .join(', ')
}
