/**
 * Assortment Agent — Deterministic Detection (trend + coordination + category-aware)
 *
 * Multi-buy signal:  avg_qty_per_tx ≥ platform p75 → bundle discount
 * Category slow-movers: bottom performers in top-revenue category
 * Bundle acceleration: strategic opportunity surfaced by coordinator
 *
 * Category z-score: compares each SKU to its category peers before flagging.
 * Suppression window respected — no re-flagging during stabilisation.
 */

import type { AgentRunContext, SkuRunContext } from './types'
import { categoryUrgencyBonus } from './detection'
import { isConflicted } from './coordinator'
import { getOutcomeEscalationAdjustment } from './outcomes'
import { trendUrgencyModifier } from './snapshots'
import { validateBundleDiscount, isCoolingDown } from './constraints'
import { isSuppressed } from './state'
import type { Mutation } from '../insights'

export const AGENT_NAME = 'Assortment Agent'

const BUNDLE_TIERS = [
  { pct: 5,  label: '5% Bundle Discount — formalise multi-buy' },
  { pct: 10, label: '10% Bundle Discount — accelerate attach rate' },
]

export function detect(ctx: AgentRunContext): SkuRunContext[] {
  const { products, dp, stateMap, trendMap, outcomeMap, conflictMap, categoryStats, strategicOpportunities } = ctx
  const results: SkuRunContext[] = []

  // ── Multi-buy signal ──────────────────────────────────────────────────────
  const multiBuySkus = products
    .filter((p) => {
      const state = stateMap.get(p.sku_id) ?? null
      if (isSuppressed(state)) return false
      if (isCoolingDown(state?.last_run_at)) return false
      if (p.status === 'on_markdown') return false
      const { blocked } = isConflicted(conflictMap, p.sku_id, 'bundle_5')
      if (blocked) return false
      return p.avg_qty_per_tx >= dp.avgQty.p75
    })
    .sort((a, b) => b.avg_qty_per_tx - a.avg_qty_per_tx)

  for (const product of multiBuySkus) {
    const state = stateMap.get(product.sku_id) ?? null
    const outcome = outcomeMap.get(product.sku_id) ?? null
    const outcomeAdj = getOutcomeEscalationAdjustment(outcome)
    if (outcomeAdj.skipSignal) continue

    const trend = trendMap.get(product.sku_id) ?? null
    const currentEscalation = Math.min(1, state?.escalation_level ?? 0)
    const adjustedEscalation = Math.max(0, currentEscalation + outcomeAdj.escalationAdjust)
    const escalationLevel = Math.min(1, adjustedEscalation)
    const startTier = Math.min(escalationLevel, BUNDLE_TIERS.length - 1)
    const tiersToOffer = BUNDLE_TIERS.slice(startTier, startTier + 2)

    const candidates = tiersToOffer.map((tier, i) => {
      const errors = validateBundleDiscount(product, tier.pct)
      const newPrice = product.retail_price * (1 - tier.pct / 100)
      const newMargin = ((newPrice - product.cost_price) / newPrice) * 100
      const mutations: Mutation[] = [
        { sku_id: product.sku_id, field: 'retail_price', operation: 'multiply', value: 1 - tier.pct / 100 },
        { sku_id: product.sku_id, field: 'markdown_pct', operation: 'set', value: tier.pct },
        { sku_id: product.sku_id, field: 'status', operation: 'set', value: 'on_markdown' },
      ]
      return {
        type: `bundle_${tier.pct}`,
        label: tier.label,
        mutations,
        estimatedImpact: `$${product.retail_price.toFixed(2)} → $${newPrice.toFixed(2)} · margin ${newMargin.toFixed(1)}% · formalises ${product.avg_qty_per_tx.toFixed(1)}× multi-buy`,
        priority: i + 1,
        constraintErrors: errors,
      }
    })

    const validCandidates = candidates.filter((c) => c.constraintErrors.length === 0)
    if (validCandidates.length === 0) continue

    const excess = ((product.avg_qty_per_tx / dp.avgQty.mean - 1) * 100).toFixed(0)
    const baseUrgency = Math.min(70, 30 + Math.round((product.avg_qty_per_tx - dp.avgQty.mean) * 10))
    const finalUrgency = Math.min(100, baseUrgency + trendUrgencyModifier(trend))

    results.push({
      product,
      issue: {
        product, trend, outcomeRecord: outcome,
        reason: `Multi-buy: ${product.avg_qty_per_tx.toFixed(1)} units/tx (${excess}% above platform mean ${dp.avgQty.mean.toFixed(1)})${outcomeAdj.note ? ' · ' + outcomeAdj.note : ''}`,
        severity: 'green',
        urgencyScore: finalUrgency,
        metrics: {
          avg_qty_per_tx: product.avg_qty_per_tx,
          platform_avg_qty: dp.avgQty.mean,
          p75_qty: dp.avgQty.p75,
          sell_through_rate: product.sell_through_rate,
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

  // ── Slow-movers in top revenue category ───────────────────────────────────
  const topCat = Object.entries(dp.categoryRevenue).sort(([, a], [, b]) => b - a)[0]?.[0]
  if (topCat) {
    const topCatShare = dp.totalRevenue > 0
      ? (dp.categoryRevenue[topCat] / dp.totalRevenue) * 100
      : 0

    if (topCatShare >= 40) {
      const catStats = categoryStats.get(topCat)

      const slowInTopCat = products
        .filter((p) => {
          const state = stateMap.get(p.sku_id) ?? null
          if (isSuppressed(state)) return false
          if (isCoolingDown(state?.last_run_at)) return false
          if (p.status === 'on_markdown') return false
          const { blocked } = isConflicted(conflictMap, p.sku_id, 'cat_rebalance_5')
          if (blocked) return false
          // Use category p25 if available, fall back to global
          const slowThreshold = catStats?.p25_sell_through ?? dp.sellThrough.p25
          return p.category === topCat && p.sell_through_rate <= slowThreshold
        })
        .sort((a, b) => a.sell_through_rate - b.sell_through_rate)
        .slice(0, 3)

      for (const product of slowInTopCat) {
        const state = stateMap.get(product.sku_id) ?? null
        const outcome = outcomeMap.get(product.sku_id) ?? null
        const outcomeAdj = getOutcomeEscalationAdjustment(outcome)
        if (outcomeAdj.skipSignal) continue

        const currentEscalation = state?.escalation_level ?? 0
        const adjustedEscalation = Math.max(0, currentEscalation + outcomeAdj.escalationAdjust)
        const escalationLevel = adjustedEscalation

        // Check for coordinator-suggested bundle acceleration
        const opportunity = strategicOpportunities.get(product.sku_id)
        const hasBundleOpp = opportunity?.opportunity === 'bundle_acceleration'

        const candidates = BUNDLE_TIERS.slice(0, 2).map((tier, i) => {
          const errors = validateBundleDiscount(product, tier.pct)
          const newPrice = product.retail_price * (1 - tier.pct / 100)
          const newMargin = ((newPrice - product.cost_price) / newPrice) * 100
          const mutations: Mutation[] = [
            { sku_id: product.sku_id, field: 'retail_price', operation: 'multiply', value: 1 - tier.pct / 100 },
            { sku_id: product.sku_id, field: 'markdown_pct', operation: 'set', value: tier.pct },
            { sku_id: product.sku_id, field: 'status', operation: 'set', value: 'on_markdown' },
          ]
          return {
            type: `cat_rebalance_${tier.pct}`,
            label: `${tier.pct}% Rebalance Discount`,
            mutations,
            estimatedImpact: `$${newPrice.toFixed(2)} · margin ${newMargin.toFixed(1)}% · stimulates ${topCat}`,
            priority: i + 1,
            constraintErrors: errors,
          }
        })

        const validCandidates = candidates.filter((c) => c.constraintErrors.length === 0)
        if (validCandidates.length === 0) continue

        const trend = trendMap.get(product.sku_id) ?? null
        const catBonus = categoryUrgencyBonus(product, catStats)
        const urgency = Math.min(70, 30 + Math.round(topCatShare / 2) + catBonus)

        const catAvgNote = catStats
          ? ` (cat avg ${catStats.avg_sell_through.toFixed(0)}%)`
          : ''

        results.push({
          product,
          issue: {
            product, trend: trendMap.get(product.sku_id) ?? null, outcomeRecord: outcome,
            reason: `Concentration: ${topCat} = ${topCatShare.toFixed(0)}% revenue · SKU at ${product.sell_through_rate.toFixed(0)}%${catAvgNote} ST needs stimulation${hasBundleOpp ? ' · ' + opportunity!.rationale : ''}`,
            severity: topCatShare >= 50 ? 'amber' : 'green',
            urgencyScore: urgency,
            metrics: {
              category: topCat,
              category_revenue_share: topCatShare,
              sell_through_rate: product.sell_through_rate,
              category_avg_st: catStats?.avg_sell_through ?? 0,
              retail_price: product.retail_price,
              inventory_value: product.inventory_value,
              urgencyScore: urgency,
              inventoryValue: product.inventory_value,
            },
          },
          validCandidates,
          state,
          escalationLevel,
        })
      }
    }
  }

  return results.sort((a, b) => b.issue.urgencyScore - a.issue.urgencyScore)
}
