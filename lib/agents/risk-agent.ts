/**
 * Risk Agent — Deterministic Detection (trend + outcome + category-aware)
 *
 * Stockout risk:    weeks_of_supply ≤ p10 + high sell-through → price up
 *                   Trend acceleration (stock depleting faster) → amplify urgency
 *                   Early warning: projected to stockout within 30 days
 * Margin recovery:  on_markdown + ST ≥ p75 → partial price recovery
 * Concentration:    top category ≥ 45% revenue + slow SKUs → rebalance
 *                   Category z-score: only flag SKUs meaningfully below category peers
 *
 * Suppression window respected — no re-flagging during stabilisation.
 */

import type { AgentRunContext, SkuRunContext } from './types'
import { urgencyScore, categoryUrgencyBonus } from './detection'
import { trendUrgencyModifier } from './snapshots'
import { getOutcomeEscalationAdjustment } from './outcomes'
import { isConflicted } from './coordinator'
import { calcMarginPct, validatePriceIncrease, validateMarkdown, isCoolingDown } from './constraints'
import { isSuppressed } from './state'
import type { Mutation } from '../insights'

export const AGENT_NAME = 'Risk Agent'

const CONCENTRATION_THRESHOLD_PCT = 45
const STOCKOUT_TIERS = [
  { pct: 5, label: '+5% Demand Capture — scarcity pricing' },
  { pct: 8, label: '+8% Demand Capture — peak scarcity' },
]
const MARGIN_RECOVERY_PCT = 5

export function detect(ctx: AgentRunContext): SkuRunContext[] {
  const { products, dp, stateMap, trendMap, outcomeMap, conflictMap, categoryStats } = ctx
  const results: SkuRunContext[] = []

  // ── Stockout risk ─────────────────────────────────────────────────────────
  const stockoutCandidates = products.filter((p) => {
    const state = stateMap.get(p.sku_id) ?? null
    if (isSuppressed(state)) return false
    if (isCoolingDown(state?.last_run_at)) return false
    const { blocked } = isConflicted(conflictMap, p.sku_id, 'stockout_price_up_5')
    if (blocked) return false

    const trend = trendMap.get(p.sku_id) ?? null
    // Include via early warning even if not yet at p10 (trend predicts stockout within 30d)
    const hasEarlyWarning = trend?.early_warning === true && p.weeks_of_supply <= dp.weeksOfSupply.p25
    return (
      (p.weeks_of_supply <= dp.weeksOfSupply.p10 || hasEarlyWarning) &&
      p.sell_through_rate >= dp.sellThrough.p50 &&
      p.current_stock > 0
    )
  }).sort((a, b) => a.weeks_of_supply - b.weeks_of_supply)

  for (const product of stockoutCandidates) {
    const state = stateMap.get(product.sku_id) ?? null
    const outcome = outcomeMap.get(product.sku_id) ?? null
    const outcomeAdj = getOutcomeEscalationAdjustment(outcome)
    if (outcomeAdj.skipSignal) continue

    const trend = trendMap.get(product.sku_id) ?? null
    const catStats = categoryStats.get(product.category)
    const baseUrgency = urgencyScore(product, dp)
    const catBonus = categoryUrgencyBonus(product, catStats)
    const trendMod = trendUrgencyModifier(trend)
    let finalUrgency = Math.min(100, baseUrgency + catBonus + trendMod)

    // Stock depleting rapidly → amplify (especially with negative acceleration)
    if (trend?.stock_velocity !== undefined && trend.stock_velocity < -3) {
      finalUrgency = Math.min(100, finalUrgency + 20)
    }
    if (trend?.sell_through_acceleration !== undefined && trend.sell_through_acceleration > 0.03) {
      // Acceleration positive (ST improving quickly) → reinforce price-up signal
      finalUrgency = Math.min(100, finalUrgency + 8)
    }

    const currentEscalation = Math.min(1, state?.escalation_level ?? 0)
    const adjustedEscalation = Math.max(0, currentEscalation + outcomeAdj.escalationAdjust)
    const escalationLevel = Math.min(1, adjustedEscalation)
    const tiersToOffer = STOCKOUT_TIERS.slice(escalationLevel, escalationLevel + 2)

    const candidates = tiersToOffer.map((tier, i) => {
      const errors = validatePriceIncrease(product, tier.pct)
      const newPrice = product.retail_price * (1 + tier.pct / 100)
      const newMargin = ((newPrice - product.cost_price) / newPrice) * 100
      const mutations: Mutation[] = [
        { sku_id: product.sku_id, field: 'retail_price', operation: 'multiply', value: 1 + tier.pct / 100 },
        { sku_id: product.sku_id, field: 'status', operation: 'set', value: 'active' },
      ]
      return {
        type: `stockout_price_up_${tier.pct}`,
        label: tier.label,
        mutations,
        estimatedImpact: `$${product.retail_price.toFixed(2)} → $${newPrice.toFixed(2)} · margin ${newMargin.toFixed(1)}% · ${product.weeks_of_supply.toFixed(1)}wks left`,
        priority: i + 1,
        constraintErrors: errors,
        refinementField: 'price_multiplier',
        refinementMin: 1 + tier.pct / 100,
        refinementMax: tiersToOffer[i + 1] ? 1 + tiersToOffer[i + 1].pct / 100 : 1 + tier.pct / 100,
      }
    })

    const validCandidates = candidates.filter((c) => c.constraintErrors.length === 0)
    if (validCandidates.length === 0) continue

    const projNote = trend?.has_trend_data && trend.projected_sell_through_30d !== undefined
      ? ` · proj 30d ST: ${trend.projected_sell_through_30d.toFixed(0)}%${trend.early_warning ? ' ⚠' : ''}`
      : ''

    const reason = [
      `Stockout risk: ${product.weeks_of_supply.toFixed(1)}wks supply (p10: ${dp.weeksOfSupply.p10.toFixed(1)}wks) · ${product.sell_through_rate.toFixed(0)}% ST${projNote}`,
      trend?.has_trend_data && trend.stock_velocity < -1
        ? `depleting at ${Math.abs(trend.stock_velocity).toFixed(1)} units/day${trend.sell_through_acceleration > 0.02 ? ' (demand accelerating)' : ''}`
        : '',
      outcomeAdj.note,
    ].filter(Boolean).join(' · ')

    results.push({
      product,
      issue: {
        product, reason, trend, outcomeRecord: outcome,
        severity: product.weeks_of_supply <= 2 ? 'red' : 'amber',
        urgencyScore: finalUrgency,
        metrics: {
          weeks_of_supply: product.weeks_of_supply,
          p10_weeks_supply: dp.weeksOfSupply.p10,
          sell_through_rate: product.sell_through_rate,
          current_stock: product.current_stock,
          retail_price: product.retail_price,
          inventory_value: product.inventory_value,
          urgencyScore: finalUrgency,
          inventoryValue: product.inventory_value,
        },
      },
      validCandidates,
      state,
      escalationLevel,
    })
  }

  // ── Margin recovery ───────────────────────────────────────────────────────
  const recoveryTargets = products
    .filter((p) => {
      const state = stateMap.get(p.sku_id) ?? null
      if (isSuppressed(state)) return false
      if (isCoolingDown(state?.last_run_at)) return false
      const { blocked } = isConflicted(conflictMap, p.sku_id, 'margin_recovery')
      if (blocked) return false
      return p.status === 'on_markdown' && p.sell_through_rate >= dp.sellThrough.p75 && p.markdown_pct > 0
    })
    .sort((a, b) => b.sell_through_rate - a.sell_through_rate)
    .slice(0, 3)

  for (const product of recoveryTargets) {
    const state = stateMap.get(product.sku_id) ?? null
    const outcome = outcomeMap.get(product.sku_id) ?? null
    const outcomeAdj = getOutcomeEscalationAdjustment(outcome)
    if (outcomeAdj.skipSignal) continue

    const errors = validatePriceIncrease(product, MARGIN_RECOVERY_PCT)
    if (errors.length > 0) continue

    const newPrice = product.retail_price * (1 + MARGIN_RECOVERY_PCT / 100)
    const currentMargin = calcMarginPct(product.retail_price, product.cost_price)
    const newMargin = calcMarginPct(newPrice, product.cost_price)
    const urgency = 40 + Math.round(product.sell_through_rate / 5)
    const mutations: Mutation[] = [
      { sku_id: product.sku_id, field: 'retail_price', operation: 'multiply', value: 1 + MARGIN_RECOVERY_PCT / 100 },
      { sku_id: product.sku_id, field: 'markdown_pct', operation: 'add', value: -MARGIN_RECOVERY_PCT },
    ]

    results.push({
      product,
      issue: {
        product, trend: trendMap.get(product.sku_id) ?? null, outcomeRecord: outcome,
        reason: `Margin recovery: ${product.sell_through_rate.toFixed(0)}% ST (above p75 ${dp.sellThrough.p75.toFixed(0)}%) supports partial price recovery from markdown`,
        severity: 'amber',
        urgencyScore: urgency,
        metrics: {
          current_margin: currentMargin,
          new_margin: newMargin,
          sell_through_rate: product.sell_through_rate,
          p75_sell_through: dp.sellThrough.p75,
          markdown_pct: product.markdown_pct,
          retail_price: product.retail_price,
          inventory_value: product.inventory_value,
          urgencyScore: urgency,
          inventoryValue: product.inventory_value,
        },
      },
      validCandidates: [{
        type: 'margin_recovery',
        label: `+${MARGIN_RECOVERY_PCT}% Margin Recovery`,
        mutations,
        estimatedImpact: `Margin ${currentMargin.toFixed(1)}% → ${newMargin.toFixed(1)}%`,
        priority: 1,
        constraintErrors: [],
      }],
      state,
      escalationLevel: state?.escalation_level ?? 0,
    })
  }

  // ── Category concentration ────────────────────────────────────────────────
  const topEntry = Object.entries(dp.categoryRevenue).sort(([, a], [, b]) => b - a)[0]
  if (topEntry && dp.totalRevenue > 0) {
    const [topCat, topRev] = topEntry
    const share = (topRev / dp.totalRevenue) * 100
    const catStats = categoryStats.get(topCat)

    if (share >= CONCENTRATION_THRESHOLD_PCT) {
      const underperformers = products
        .filter((p) => {
          const state = stateMap.get(p.sku_id) ?? null
          if (isSuppressed(state)) return false
          if (isCoolingDown(state?.last_run_at)) return false
          const { blocked } = isConflicted(conflictMap, p.sku_id, 'concentration_rebalance_12')
          if (blocked) return false
          // Use category p25 for threshold if available (more precise than global)
          const slowThreshold = catStats?.p25_sell_through ?? dp.sellThrough.p25
          return p.category === topCat && p.sell_through_rate <= slowThreshold && p.status !== 'on_markdown'
        })
        .sort((a, b) => a.sell_through_rate - b.sell_through_rate)
        .slice(0, 2)

      for (const product of underperformers) {
        const state = stateMap.get(product.sku_id) ?? null
        const outcome = outcomeMap.get(product.sku_id) ?? null
        const outcomeAdj = getOutcomeEscalationAdjustment(outcome)
        if (outcomeAdj.skipSignal) continue

        const markdownPct = 12
        const errors = validateMarkdown(product, markdownPct)
        if (errors.length > 0) continue

        const newPrice = product.retail_price * (1 - markdownPct / 100)
        const newMargin = calcMarginPct(newPrice, product.cost_price)
        const catBonus = categoryUrgencyBonus(product, catStats)
        const urgency = Math.min(80, 40 + Math.round(share - CONCENTRATION_THRESHOLD_PCT) + catBonus)
        const mutations: Mutation[] = [
          { sku_id: product.sku_id, field: 'retail_price', operation: 'multiply', value: 1 - markdownPct / 100 },
          { sku_id: product.sku_id, field: 'markdown_pct', operation: 'set', value: markdownPct },
          { sku_id: product.sku_id, field: 'status', operation: 'set', value: 'on_markdown' },
        ]

        const catAvgNote = catStats
          ? ` (cat avg ${catStats.avg_sell_through.toFixed(0)}%)`
          : ''

        results.push({
          product,
          issue: {
            product, trend: trendMap.get(product.sku_id) ?? null, outcomeRecord: outcome,
            reason: `Revenue concentration: ${topCat} = ${share.toFixed(0)}% (threshold ${CONCENTRATION_THRESHOLD_PCT}%) · ${product.sku_id} at ${product.sell_through_rate.toFixed(0)}%${catAvgNote} ST needs rebalancing`,
            severity: share >= 55 ? 'red' : 'amber',
            urgencyScore: urgency,
            metrics: {
              category: topCat, category_share_pct: share,
              concentration_threshold: CONCENTRATION_THRESHOLD_PCT,
              sell_through_rate: product.sell_through_rate,
              category_avg_st: catStats?.avg_sell_through ?? 0,
              retail_price: product.retail_price,
              inventory_value: product.inventory_value,
              urgencyScore: urgency,
              inventoryValue: product.inventory_value,
            },
          },
          validCandidates: [{
            type: `concentration_rebalance_${markdownPct}`,
            label: `${markdownPct}% Rebalance Markdown`,
            mutations,
            estimatedImpact: `$${newPrice.toFixed(2)} · margin ${newMargin.toFixed(1)}%`,
            priority: 1,
            constraintErrors: [],
          }],
          state,
          escalationLevel: state?.escalation_level ?? 0,
        })
      }
    }
  }

  return results.sort((a, b) => b.issue.urgencyScore - a.issue.urgencyScore)
}
