/**
 * Markdown Agent — Deterministic Detection (trend + outcome + category-aware)
 *
 * Detection: sell_through < p25 AND weeks_of_supply > p75 (relative thresholds)
 *            OR weeks_of_supply > p90 (extreme overstock)
 *            PLUS category z-score bonus (SKU worse than peers)
 *
 * Trend modifier: declining velocity + negative acceleration → higher urgency
 *                 30-day projection below threshold → early-warning bump
 * Outcome feedback: graduated escalation reduction (not full reset)
 *                   suppress_until respected — no re-flagging during stabilisation
 *
 * Escalation tiers:
 *   0 → 10% | 1 → 15% | 2 → 20% | 3 → 25% (clearance)
 */

import type { AgentRunContext, SkuRunContext } from './types'
import { urgencyScore, categoryUrgencyBonus } from './detection'
import { trendUrgencyModifier } from './snapshots'
import { getOutcomeEscalationAdjustment } from './outcomes'
import { isConflicted } from './coordinator'
import { validateMarkdown, isCoolingDown } from './constraints'
import { isSuppressed } from './state'
import type { Mutation } from '../insights'

export const AGENT_NAME = 'Markdown Agent'

const MARKDOWN_TIERS = [
  { pct: 10, label: '10% Markdown — light promotion' },
  { pct: 15, label: '15% Markdown — clearance start' },
  { pct: 20, label: '20% Markdown — clearance push' },
  { pct: 25, label: '25% Markdown — final clearance' },
]

export function detect(ctx: AgentRunContext): SkuRunContext[] {
  const { products, dp, stateMap, trendMap, outcomeMap, conflictMap, categoryStats } = ctx
  const results: SkuRunContext[] = []

  for (const product of products) {
    const state = stateMap.get(product.sku_id) ?? null

    // Respect suppression window (set when a prior action had bad/inefficient outcome)
    if (isSuppressed(state)) continue
    if (isCoolingDown(state?.last_run_at)) continue

    const isSlowSeller = product.sell_through_rate <= dp.sellThrough.p25
    const isOverstocked = product.weeks_of_supply >= dp.weeksOfSupply.p75
    const isExtremeOverstock = product.weeks_of_supply >= dp.weeksOfSupply.p90
    if (!isSlowSeller && !isExtremeOverstock) continue

    // Outcome feedback
    const outcome = outcomeMap.get(product.sku_id) ?? null
    const outcomeAdj = getOutcomeEscalationAdjustment(outcome)
    if (outcomeAdj.skipSignal) continue

    // Conflict check
    const { blocked } = isConflicted(conflictMap, product.sku_id, 'markdown_10')
    if (blocked) continue

    const trend = trendMap.get(product.sku_id) ?? null
    const catStats = categoryStats.get(product.category)
    const baseUrgency = urgencyScore(product, dp)
    const catBonus = categoryUrgencyBonus(product, catStats)
    const trendMod = trendUrgencyModifier(trend)
    const finalUrgency = Math.min(100, Math.max(0, baseUrgency + catBonus + trendMod))

    let severity: 'red' | 'amber' | 'green' = 'green'
    if (isExtremeOverstock || (isSlowSeller && isOverstocked)) severity = 'red'
    else if (isSlowSeller) severity = 'amber'
    if (trend?.wos_trend === 'worsening' && severity === 'amber') severity = 'red'

    // Category context note
    const catNote = catStats && catStats.count >= 3
      ? `vs category avg ST ${catStats.avg_sell_through.toFixed(0)}%`
      : ''

    // Trend projection note
    const projNote = trend?.has_trend_data && trend.projected_sell_through_30d < product.sell_through_rate
      ? `proj 30d: ${trend.projected_sell_through_30d.toFixed(0)}%${trend.early_warning ? ' ⚠' : ''}`
      : ''

    const reason = [
      isExtremeOverstock
        ? `Extreme overstock: ${product.weeks_of_supply.toFixed(1)}wks supply (p90: ${dp.weeksOfSupply.p90.toFixed(1)}wks)`
        : `Slow sell-through ${product.sell_through_rate.toFixed(0)}% (p25: ${dp.sellThrough.p25.toFixed(0)}%)${catNote ? ' · ' + catNote : ''} · ${product.weeks_of_supply.toFixed(1)}wks supply`,
      trend?.has_trend_data
        ? `Trend: ST velocity ${trend.sell_through_velocity > 0 ? '+' : ''}${trend.sell_through_velocity.toFixed(2)}pts/day${trend.sell_through_acceleration !== 0 ? ` (accel ${trend.sell_through_acceleration > 0 ? '+' : ''}${trend.sell_through_acceleration.toFixed(3)})` : ''}, stock ${trend.wos_trend}${projNote ? ' · ' + projNote : ''}`
        : '',
      outcomeAdj.note,
    ].filter(Boolean).join(' · ')

    // Graduated escalation: outcome adjustment shifts current level, then +1 for this signal
    const currentEscalation = Math.min(3, state?.escalation_level ?? 0)
    const adjustedEscalation = Math.max(0, currentEscalation + outcomeAdj.escalationAdjust)
    const escalationLevel = Math.min(3, adjustedEscalation)

    const startTier = Math.min(escalationLevel, MARKDOWN_TIERS.length - 1)
    const tiersToOffer = MARKDOWN_TIERS.slice(startTier, Math.min(startTier + 2, MARKDOWN_TIERS.length))

    const candidates = tiersToOffer.map((tier, i) => {
      const errors = validateMarkdown(product, tier.pct)
      const newPrice = product.retail_price * (1 - tier.pct / 100)
      const newMargin = ((newPrice - product.cost_price) / newPrice) * 100
      const mutations: Mutation[] = [
        { sku_id: product.sku_id, field: 'retail_price', operation: 'multiply', value: 1 - tier.pct / 100 },
        { sku_id: product.sku_id, field: 'markdown_pct', operation: 'set', value: tier.pct },
        { sku_id: product.sku_id, field: 'status', operation: 'set', value: 'on_markdown' },
      ]
      return {
        type: `markdown_${tier.pct}`,
        label: tier.label,
        mutations,
        estimatedImpact: `$${product.retail_price.toFixed(2)} → $${newPrice.toFixed(2)} · margin ${newMargin.toFixed(1)}%`,
        priority: i + 1,
        constraintErrors: errors,
        refinementField: 'markdown_pct',
        refinementMin: tier.pct,
        refinementMax: tiersToOffer[i + 1]?.pct ?? tier.pct,
      }
    })

    const validCandidates = candidates.filter((c) => c.constraintErrors.length === 0)
    if (validCandidates.length === 0) continue

    results.push({
      product,
      issue: {
        product, reason, severity, urgencyScore: finalUrgency, trend, outcomeRecord: outcome,
        metrics: {
          retail_price: product.retail_price,
          cost_price: product.cost_price,
          sell_through_rate: product.sell_through_rate,
          weeks_of_supply: product.weeks_of_supply,
          inventory_value: product.inventory_value,
          current_stock: product.current_stock,
          markdown_pct: product.markdown_pct,
          p25_sell_through: dp.sellThrough.p25,
          p75_weeks_supply: dp.weeksOfSupply.p75,
          p90_weeks_supply: dp.weeksOfSupply.p90,
          category_avg_st: catStats?.avg_sell_through ?? 0,
          urgencyScore: finalUrgency,
          inventoryValue: product.inventory_value,
        },
      },
      validCandidates,
      state,
      escalationLevel,
    })
  }

  return results.sort((a, b) => b.issue.urgencyScore - a.issue.urgencyScore)
}
