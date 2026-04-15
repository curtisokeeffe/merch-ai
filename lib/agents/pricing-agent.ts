/**
 * Pricing Agent — Deterministic Detection (trend + outcome + category-aware)
 *
 * Fast movers: sell-through ≥ p75 AND weeks_of_supply ≤ p25 → price increase
 * Premium SKUs: price ≥ 1.8× avg AND sell-through ≥ p50 → loyalty pricing
 *
 * Category context: if SKU sells faster than its category peers (high z-score),
 * that amplifies confidence in the price-up signal.
 * Trend modifier: stock depleting fast + negative acceleration → more urgent
 * Strategic: surfaces sustained-demand opportunities from coordinator
 */

import type { AgentRunContext, SkuRunContext } from './types'
import { urgencyScore, categoryUrgencyBonus } from './detection'
import { trendUrgencyModifier } from './snapshots'
import { getOutcomeEscalationAdjustment } from './outcomes'
import { isConflicted } from './coordinator'
import { validatePriceIncrease, validateBundleDiscount, isCoolingDown } from './constraints'
import { isSuppressed } from './state'
import type { Mutation } from '../insights'

export const AGENT_NAME = 'Pricing Agent'

const PRICE_UP_TIERS = [
  { pct: 5,  label: '+5% Price Increase — demand capture' },
  { pct: 8,  label: '+8% Price Increase — scarcity pricing' },
  { pct: 10, label: '+10% Price Increase — peak demand capture' },
]

const LOYALTY_DISCOUNT_PCT = 7

export function detect(ctx: AgentRunContext): SkuRunContext[] {
  const { products, dp, stateMap, trendMap, outcomeMap, conflictMap, categoryStats, strategicOpportunities } = ctx
  const results: SkuRunContext[] = []
  const avgPrice = dp.price.mean

  for (const product of products) {
    const state = stateMap.get(product.sku_id) ?? null
    if (isSuppressed(state)) continue
    if (isCoolingDown(state?.last_run_at)) continue

    const isFastMover =
      product.sell_through_rate >= dp.sellThrough.p75 &&
      product.weeks_of_supply <= dp.weeksOfSupply.p25

    const isPremium =
      product.retail_price >= avgPrice * 1.8 &&
      product.sell_through_rate >= dp.sellThrough.p50 &&
      product.status !== 'loyalty-priced'

    // Also surface SKUs with sustained-demand opportunity from coordinator
    const opportunity = strategicOpportunities.get(product.sku_id)
    const hasSustainedDemand = opportunity?.opportunity === 'sustained_demand'

    if (!isFastMover && !isPremium && !hasSustainedDemand) continue

    const outcome = outcomeMap.get(product.sku_id) ?? null
    const outcomeAdj = getOutcomeEscalationAdjustment(outcome)
    if (outcomeAdj.skipSignal) continue

    const trend = trendMap.get(product.sku_id) ?? null
    const catStats = categoryStats.get(product.category)
    const baseUrgency = urgencyScore(product, dp)

    // For pricing agent: category bonus works in reverse — selling faster than peers = more confident
    // so we use it positively for fast movers
    const catFastBonus = (() => {
      if (!catStats || catStats.count < 3) return 0
      const stZ = (product.sell_through_rate - catStats.avg_sell_through) / (catStats.st_stddev || 1)
      return stZ > 1.0 ? 8 : stZ > 0.5 ? 4 : 0
    })()

    const trendMod = trendUrgencyModifier(trend)
    let finalUrgency = Math.min(100, Math.max(0, baseUrgency + catFastBonus + trendMod))

    // Stock depleting fast → amplify urgency for price capture
    if (trend?.stock_velocity !== undefined && trend.stock_velocity < -5) {
      finalUrgency = Math.min(100, finalUrgency + 15)
    }

    if (isFastMover || hasSustainedDemand) {
      const { blocked } = isConflicted(conflictMap, product.sku_id, 'price_up_5')
      if (blocked) continue

      const currentEscalation = Math.min(2, state?.escalation_level ?? 0)
      const adjustedEscalation = Math.max(0, currentEscalation + outcomeAdj.escalationAdjust)
      const escalationLevel = Math.min(2, adjustedEscalation)
      const startTier = Math.min(escalationLevel, PRICE_UP_TIERS.length - 1)
      const tiersToOffer = PRICE_UP_TIERS.slice(startTier, startTier + 2)

      const candidates = tiersToOffer.map((tier, i) => {
        const errors = validatePriceIncrease(product, tier.pct)
        const newPrice = product.retail_price * (1 + tier.pct / 100)
        const newMargin = ((newPrice - product.cost_price) / newPrice) * 100
        const mutations: Mutation[] = [
          { sku_id: product.sku_id, field: 'retail_price', operation: 'multiply', value: 1 + tier.pct / 100 },
          { sku_id: product.sku_id, field: 'status', operation: 'set', value: 'active' },
        ]
        return {
          type: `price_up_${tier.pct}`,
          label: tier.label,
          mutations,
          estimatedImpact: `$${product.retail_price.toFixed(2)} → $${newPrice.toFixed(2)} · margin ${newMargin.toFixed(1)}%`,
          priority: i + 1,
          constraintErrors: errors,
          refinementField: 'price_multiplier',
          refinementMin: 1 + tier.pct / 100,
          refinementMax: tiersToOffer[i + 1] ? 1 + tiersToOffer[i + 1].pct / 100 : 1 + tier.pct / 100,
        }
      })

      const validCandidates = candidates.filter((c) => c.constraintErrors.length === 0)
      if (validCandidates.length === 0) continue

      const catNote = catStats && catFastBonus > 0
        ? `${product.sell_through_rate.toFixed(0)}% vs category avg ${catStats.avg_sell_through.toFixed(0)}%`
        : `${product.sell_through_rate.toFixed(0)}% ST`

      const reason = [
        hasSustainedDemand && !isFastMover
          ? `Sustained demand: ${opportunity!.rationale}`
          : `Fast mover: ${catNote} (p75: ${dp.sellThrough.p75.toFixed(0)}%), ${product.weeks_of_supply.toFixed(1)}wks supply`,
        trend?.has_trend_data && trend.stock_velocity < -2
          ? `Stock depleting at ${Math.abs(trend.stock_velocity).toFixed(1)} units/day${trend.sell_through_acceleration < -0.02 ? ' (decelerating)' : ''}`
          : '',
        outcomeAdj.note,
      ].filter(Boolean).join(' · ')

      results.push({
        product,
        issue: {
          product, reason, trend, outcomeRecord: outcome,
          severity: product.weeks_of_supply <= dp.weeksOfSupply.p10 ? 'red' : 'amber',
          urgencyScore: finalUrgency,
          metrics: {
            retail_price: product.retail_price,
            sell_through_rate: product.sell_through_rate,
            weeks_of_supply: product.weeks_of_supply,
            p75_sell_through: dp.sellThrough.p75,
            p25_weeks_supply: dp.weeksOfSupply.p25,
            category_avg_st: catStats?.avg_sell_through ?? 0,
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

    if (isPremium) {
      const { blocked } = isConflicted(conflictMap, product.sku_id, 'loyalty_pricing')
      if (blocked) continue

      const errors = validateBundleDiscount(product, LOYALTY_DISCOUNT_PCT)
      if (errors.length > 0) continue

      const newPrice = product.retail_price * (1 - LOYALTY_DISCOUNT_PCT / 100)
      const newMargin = ((newPrice - product.cost_price) / newPrice) * 100
      const mutations: Mutation[] = [
        { sku_id: product.sku_id, field: 'retail_price', operation: 'multiply', value: 1 - LOYALTY_DISCOUNT_PCT / 100 },
        { sku_id: product.sku_id, field: 'status', operation: 'set', value: 'loyalty-priced' },
      ]

      const premiumUrgency = Math.round(finalUrgency * 0.6)
      results.push({
        product,
        issue: {
          product, trend, outcomeRecord: outcome,
          reason: `Premium SKU $${product.retail_price.toFixed(2)} (${(product.retail_price / avgPrice).toFixed(1)}× avg) · ${product.sell_through_rate.toFixed(0)}% ST — loyalty conversion opportunity`,
          severity: 'green',
          urgencyScore: premiumUrgency,
          metrics: {
            retail_price: product.retail_price,
            avg_platform_price: avgPrice,
            sell_through_rate: product.sell_through_rate,
            inventory_value: product.inventory_value,
            urgencyScore: premiumUrgency,
            inventoryValue: product.inventory_value,
          },
        },
        validCandidates: [{
          type: 'loyalty_pricing',
          label: `${LOYALTY_DISCOUNT_PCT}% Loyalty Discount`,
          mutations,
          estimatedImpact: `$${product.retail_price.toFixed(2)} → $${newPrice.toFixed(2)} · margin ${newMargin.toFixed(1)}%`,
          priority: 1,
          constraintErrors: [],
        }],
        state,
        escalationLevel: state?.escalation_level ?? 0,
      })
    }
  }

  return results.sort((a, b) => b.issue.urgencyScore - a.issue.urgencyScore)
}
