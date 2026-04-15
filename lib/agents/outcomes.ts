/**
 * Outcome Feedback Loop
 *
 * Measures whether past approved actions actually improved key metrics.
 * Uses before_snapshot from action_log vs current live_products state.
 *
 * Scoring:
 *  - outcome_score > 0  → action worked → reduce urgency, graduated escalation reduction
 *  - outcome_score < 0  → action didn't help → flag for strategy change
 *  - outcome_score = 0  → not yet mature or no data
 *
 * Efficiency ratio (outcome_score / action_magnitude):
 *  - Prevents over-escalation: a large markdown that barely moved the needle
 *    scores worse than a small markdown that drove a big improvement.
 *
 * Graduated escalation reset (replaces full reset):
 *  - High efficiency → reduce escalation by 2 (big win, reset almost fully)
 *  - Medium efficiency → reduce by 1 (partial win, take one step back)
 *  - Negative outcome → suppress SKU for N days (stabilisation window)
 *
 * suppress_until: set when an action had a strongly negative outcome, giving
 * the SKU time to stabilise before agents can re-flag it.
 */

import type { Database } from 'better-sqlite3'
import type { ProductRow } from '../db'
import type { OutcomeRecord } from './types'

const OUTCOME_MATURITY_DAYS = 7    // don't evaluate before 7 days post-action
const OUTCOME_EXPIRY_DAYS = 60     // ignore very old actions
const SUPPRESS_DAYS_BAD = 14       // suppress for 14 days after a bad outcome
const SUPPRESS_DAYS_INEFFICIENT = 7 // suppress for 7 days after an inefficient (large but low-impact) action

// ── Build outcome map for all SKUs with recent approved actions ───────────────

export function buildOutcomeMap(
  db: Database,
  products: ProductRow[]
): Map<string, OutcomeRecord> {
  const map = new Map<string, OutcomeRecord>()
  const productLookup = new Map(products.map((p) => [p.sku_id, p]))

  const logs = db.prepare(`
    SELECT action_id, agent_source, action_type, affected_skus, mutations, before_snapshot, approved_at
    FROM action_log
    WHERE status = 'approved'
      AND approved_at >= datetime('now', '-${OUTCOME_EXPIRY_DAYS} days')
    ORDER BY approved_at DESC
  `).all() as {
    action_id: string
    agent_source: string
    action_type: string
    affected_skus: string
    mutations: string
    before_snapshot: string
    approved_at: string
  }[]

  for (const log of logs) {
    let affectedSkus: string[]
    let beforeSnapshot: ProductRow[]
    let mutations: { field: string; value: number | string }[]

    try {
      affectedSkus = JSON.parse(log.affected_skus) as string[]
      beforeSnapshot = JSON.parse(log.before_snapshot) as ProductRow[]
      mutations = JSON.parse(log.mutations) as { field: string; value: number | string }[]
    } catch {
      continue
    }

    const daysAgo = (Date.now() - new Date(log.approved_at).getTime()) / 86_400_000
    const isMature = daysAgo >= OUTCOME_MATURITY_DAYS

    for (const skuId of affectedSkus) {
      if (map.has(skuId)) continue  // use most recent action per SKU

      const current = productLookup.get(skuId)
      const before = beforeSnapshot.find((r) => r.sku_id === skuId)

      if (!current || !before) continue

      const sellThroughDelta = current.sell_through_rate - before.sell_through_rate
      const stockDelta = before.current_stock - current.current_stock  // +ve = stock sold
      const inventoryValueDelta = before.inventory_value - current.inventory_value // +ve = good

      // Infer action magnitude from mutations (what % was applied)
      let actionMagnitude = 0
      for (const m of mutations) {
        if (m.field === 'markdown_pct' && typeof m.value === 'number') {
          actionMagnitude = Math.abs(m.value)
          break
        }
        if (m.field === 'retail_price' && typeof m.value === 'number') {
          // value is a multiplier (e.g. 0.85 = 15% off, 1.05 = 5% up)
          actionMagnitude = Math.abs((m.value as number - 1) * 100)
          break
        }
      }
      // Fallback: extract magnitude from action_type string (e.g. 'markdown_15' → 15)
      if (actionMagnitude === 0) {
        const match = log.action_type.match(/(\d+)$/)
        if (match) actionMagnitude = parseInt(match[1])
      }

      // Composite outcome score
      let outcomeScore = 0
      if (isMature) {
        outcomeScore += sellThroughDelta * 2      // +2 per percentage point improvement
        outcomeScore += stockDelta > 0 ? 10 : 0   // +10 if any stock sold
        outcomeScore += inventoryValueDelta > 0 ? 5 : 0  // +5 if inv value reduced

        // Penalise if status remained stuck
        if (current.status === 'on_markdown' && sellThroughDelta <= 0 && stockDelta <= 0) {
          outcomeScore -= 15
        }
      }

      // Efficiency: outcome delivered per unit of action (higher = better)
      // e.g. +20 outcome from 10% markdown = 2.0 efficiency
      //      +5 outcome from 25% markdown = 0.2 efficiency (over-actioned)
      const actionEfficiency = actionMagnitude > 0
        ? Math.round((outcomeScore / actionMagnitude) * 100) / 100
        : 0

      map.set(skuId, {
        sku_id: skuId,
        action_type: log.action_type,
        approved_at: log.approved_at,
        days_since_action: Math.round(daysAgo * 10) / 10,
        sell_through_delta: Math.round(sellThroughDelta * 10) / 10,
        stock_delta: stockDelta,
        inventory_value_delta: Math.round(inventoryValueDelta * 100) / 100,
        outcome_score: Math.round(outcomeScore * 10) / 10,
        is_mature: isMature,
        action_magnitude: Math.round(actionMagnitude * 10) / 10,
        action_efficiency: actionEfficiency,
      })
    }
  }

  return map
}

// ── Outcome-driven escalation adjuster ───────────────────────────────────────
// Returns how much to adjust escalation and whether to suppress.
// escalationAdjust is now a delta (-2 / -1 / 0), NOT a reset to 0.

export function getOutcomeEscalationAdjustment(
  outcome: OutcomeRecord | null | undefined
): {
  skipSignal: boolean
  escalationAdjust: number       // add this to current escalation_level (can be negative)
  suppressDays: number           // set suppress_until = now + N days (0 = don't suppress)
  note: string
} {
  if (!outcome || !outcome.is_mature) {
    return { skipSignal: false, escalationAdjust: 0, suppressDays: 0, note: '' }
  }

  // Strong success (high efficiency + good absolute score)
  if (outcome.outcome_score > 15 && outcome.action_efficiency >= 1.5) {
    return {
      skipSignal: true,
      escalationAdjust: -2,   // big step back — it worked well, back off
      suppressDays: 0,
      note: `Prior action (${outcome.action_type}) highly effective — ST +${outcome.sell_through_delta}pts · efficiency ${outcome.action_efficiency.toFixed(1)}`,
    }
  }

  // Moderate success
  if (outcome.outcome_score > 5) {
    return {
      skipSignal: false,
      escalationAdjust: -1,   // partial win — take one step back
      suppressDays: 0,
      note: `Prior action partially effective (score ${outcome.outcome_score.toFixed(0)}, eff ${outcome.action_efficiency.toFixed(1)}) — de-escalating`,
    }
  }

  // Positive score but poor efficiency (large action, small result) → suppress briefly
  if (outcome.outcome_score > 0 && outcome.action_efficiency < 0.3 && outcome.action_magnitude >= 15) {
    return {
      skipSignal: false,
      escalationAdjust: 0,
      suppressDays: SUPPRESS_DAYS_INEFFICIENT,
      note: `Prior ${outcome.action_type} had low efficiency (${outcome.action_efficiency.toFixed(1)}) — monitoring before re-actioning`,
    }
  }

  // Bad outcome — suppress and try different strategy
  if (outcome.outcome_score < -5) {
    return {
      skipSignal: false,
      escalationAdjust: 0,   // don't escalate — different strategy needed
      suppressDays: SUPPRESS_DAYS_BAD,
      note: `Prior action (${outcome.action_type}) ineffective after ${outcome.days_since_action}d — suppressing ${SUPPRESS_DAYS_BAD}d to avoid thrashing`,
    }
  }

  return { skipSignal: false, escalationAdjust: 0, suppressDays: 0, note: '' }
}

// ── Persist updated outcome scores + suppress_until to agent_state ─────────────

export function persistOutcomeScores(
  db: Database,
  agentName: string,
  outcomeMap: Map<string, OutcomeRecord>
): void {
  const updateScore = db.prepare(`
    UPDATE agent_state
    SET outcome_score = ?, outcome_checked_at = ?
    WHERE agent_name = ? AND sku_id = ?
  `)

  const updateSuppress = db.prepare(`
    UPDATE agent_state
    SET suppress_until = ?
    WHERE agent_name = ? AND sku_id = ?
  `)

  const now = new Date().toISOString()

  db.transaction(() => {
    for (const [skuId, outcome] of outcomeMap) {
      if (!outcome.is_mature) continue

      updateScore.run(outcome.outcome_score, now, agentName, skuId)

      // Apply suppress_until if warranted
      const adj = getOutcomeEscalationAdjustment(outcome)
      if (adj.suppressDays > 0) {
        const suppressUntil = new Date(Date.now() + adj.suppressDays * 86_400_000).toISOString()
        updateSuppress.run(suppressUntil, agentName, skuId)
      }
    }
  })()
}
