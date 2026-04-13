import type { Database } from 'better-sqlite3'
import type { ProductRow, ActionLogRow } from './db'

export type Severity = 'red' | 'amber' | 'green'

export interface Mutation {
  sku_id: string
  field: string
  operation: 'multiply' | 'set' | 'add'
  value: number | string
}

export interface ActionCard {
  id: string
  severity: Severity
  title: string
  impact: string
  context: string
  dataSummary: string
  mutations: Mutation[]
  affectedSkus: string[]
  agentSource: string
}

export interface InsightsResult {
  cards: ActionCard[]
  datasetSummary: string
  actionLogSummary: string
}

function usd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function pct(n: number) {
  return `${n.toFixed(1)}%`
}

function buildActionLogSummary(logs: ActionLogRow[]): string {
  const approved = logs.filter((l) => l.status === 'approved')
  if (!approved.length) return 'No actions have been taken yet.'
  return approved
    .map((l) => {
      const skus = JSON.parse(l.affected_skus) as string[]
      return `[${l.approved_at?.split('T')[1]?.split('.')[0] ?? ''}] ${l.agent_source} → ${l.title} (affected: ${skus.join(', ')})`
    })
    .join('\n')
}

export function computeInsights(db: Database): InsightsResult {
  const rows = db.prepare('SELECT * FROM live_products').all() as ProductRow[]
  const logs = db.prepare('SELECT * FROM action_log ORDER BY approved_at DESC').all() as ActionLogRow[]

  if (!rows.length) {
    return { cards: [], datasetSummary: 'No data loaded.', actionLogSummary: '' }
  }

  const totalInvValue = rows.reduce((s, r) => s + r.inventory_value, 0)
  const totalTx = rows.reduce((s, r) => s + r.transaction_count, 0)
  const totalRevenue = rows.reduce((s, r) => s + r.total_revenue, 0)
  const cats = [...new Set(rows.map((r) => r.category))]

  const alreadyMarkdownSkus = new Set(
    logs
      .filter((l) => l.status === 'approved')
      .flatMap((l) => JSON.parse(l.affected_skus) as string[])
  )

  function catRows(cat: string) {
    return rows.filter((r) => r.category === cat)
  }

  // ─────────────────────────────────────────────
  // Card 1: Slow-mover markdowns (worst category by sell-through)
  // ─────────────────────────────────────────────
  const catSellThrough = cats.map((cat) => {
    const rs = catRows(cat)
    const avg = rs.reduce((s, r) => s + r.sell_through_rate, 0) / rs.length
    return { cat, avg, rows: rs }
  }).sort((a, b) => a.avg - b.avg)

  const slowCat = catSellThrough[0]
  const slowMovers = slowCat.rows
    .filter((r) => !alreadyMarkdownSkus.has(r.sku_id))
    .sort((a, b) => a.sell_through_rate - b.sell_through_rate)
    .slice(0, 3)

  const slowMoverMutations: Mutation[] = slowMovers.flatMap((r) => [
    { sku_id: r.sku_id, field: 'retail_price', operation: 'multiply', value: 0.85 },
    { sku_id: r.sku_id, field: 'markdown_pct', operation: 'set', value: 15 },
    { sku_id: r.sku_id, field: 'status', operation: 'set', value: 'on_markdown' },
  ])

  const slowMoverInvValue = slowMovers.reduce((s, r) => s + r.inventory_value, 0)
  const projectedRecovery = slowMoverInvValue * 0.62

  // ─────────────────────────────────────────────
  // Card 2: Electronics price-tier variance
  // ─────────────────────────────────────────────
  const elecRows = catRows('Electronics')
  const elecLow = elecRows.filter((r) => r.retail_price < 100 && !alreadyMarkdownSkus.has(r.sku_id))
  const elecHigh = elecRows.filter((r) => r.retail_price >= 300)
  const elecLowAOV = elecLow.length ? elecLow.reduce((s, r) => s + r.retail_price, 0) / elecLow.length : 0
  const elecHighAOV = elecHigh.length ? elecHigh.reduce((s, r) => s + r.retail_price, 0) / elecHigh.length : 0
  const elecSpreadX = elecLowAOV > 0 ? Math.round(elecHighAOV / elecLowAOV) : 0

  const elecBundleMutations: Mutation[] = elecLow.slice(0, 2).flatMap((r) => [
    { sku_id: r.sku_id, field: 'retail_price', operation: 'multiply', value: 0.9 },
    { sku_id: r.sku_id, field: 'markdown_pct', operation: 'set', value: 10 },
    { sku_id: r.sku_id, field: 'status', operation: 'set', value: 'on_markdown' },
  ])

  // ─────────────────────────────────────────────
  // Card 3: High weeks-of-supply (excess inventory)
  // ─────────────────────────────────────────────
  const excessInv = rows
    .filter((r) => r.weeks_of_supply > 16 && !alreadyMarkdownSkus.has(r.sku_id))
    .sort((a, b) => b.weeks_of_supply - a.weeks_of_supply)
    .slice(0, 3)

  const excessMutations: Mutation[] = excessInv.flatMap((r) => [
    { sku_id: r.sku_id, field: 'retail_price', operation: 'multiply', value: 0.8 },
    { sku_id: r.sku_id, field: 'markdown_pct', operation: 'set', value: 20 },
    { sku_id: r.sku_id, field: 'status', operation: 'set', value: 'on_markdown' },
  ])

  const excessInvValue = excessInv.reduce((s, r) => s + r.inventory_value, 0)

  // ─────────────────────────────────────────────
  // Card 4: Margin compression on marked-down SKUs
  // ─────────────────────────────────────────────
  const onMarkdown = rows.filter((r) => r.status === 'on_markdown')
  const normalRows = rows.filter((r) => r.status !== 'on_markdown')
  const avgMarginNormal = normalRows.length
    ? normalRows.reduce((s, r) => s + ((r.retail_price - r.cost_price) / r.retail_price) * 100, 0) / normalRows.length
    : 0
  const avgMarginMarkdown = onMarkdown.length
    ? onMarkdown.reduce((s, r) => s + ((r.retail_price - r.cost_price) / r.retail_price) * 100, 0) / onMarkdown.length
    : 0

  // Margin recovery: re-price the least-margin markdown SKUs slightly up if sell-through improved
  const marginRecoverySkus = onMarkdown
    .filter((r) => r.sell_through_rate > 60)
    .sort((a, b) => a.retail_price - b.retail_price)
    .slice(0, 2)

  const marginRecoveryMutations: Mutation[] = marginRecoverySkus.flatMap((r) => [
    { sku_id: r.sku_id, field: 'retail_price', operation: 'multiply', value: 1.05 },
    { sku_id: r.sku_id, field: 'markdown_pct', operation: 'add', value: -5 },
  ])

  // ─────────────────────────────────────────────
  // Card 5: Beauty bundling — multi-unit opportunity
  // ─────────────────────────────────────────────
  const beautyRows = catRows('Beauty')
  const clothingRows = catRows('Clothing')
  const beautyAvgQty = beautyRows.length ? beautyRows.reduce((s, r) => s + r.avg_qty_per_tx, 0) / beautyRows.length : 0
  const platformAvgQty = rows.reduce((s, r) => s + r.avg_qty_per_tx, 0) / rows.length
  const beautyBundleTargets = beautyRows
    .filter((r) => !alreadyMarkdownSkus.has(r.sku_id))
    .sort((a, b) => b.avg_qty_per_tx - a.avg_qty_per_tx)
    .slice(0, 2)

  const beautyBundleMutations: Mutation[] = beautyBundleTargets.flatMap((r) => [
    { sku_id: r.sku_id, field: 'retail_price', operation: 'multiply', value: 0.95 },
    { sku_id: r.sku_id, field: 'markdown_pct', operation: 'set', value: 5 },
    { sku_id: r.sku_id, field: 'status', operation: 'set', value: 'on_markdown' },
  ])

  // ─────────────────────────────────────────────
  // Card 6: Fast movers — risk of stockout
  // ─────────────────────────────────────────────
  const fastMovers = rows
    .filter((r) => r.sell_through_rate > 75 && r.weeks_of_supply < 4)
    .sort((a, b) => a.weeks_of_supply - b.weeks_of_supply)
    .slice(0, 3)

  const fastMoverMutations: Mutation[] = fastMovers.flatMap((r) => [
    { sku_id: r.sku_id, field: 'retail_price', operation: 'multiply', value: 1.08 },
    { sku_id: r.sku_id, field: 'status', operation: 'set', value: 'active' },
  ])

  // ─────────────────────────────────────────────
  // Card 7: Category revenue concentration risk
  // ─────────────────────────────────────────────
  const catRevenue = cats.map((cat) => ({
    cat,
    rev: catRows(cat).reduce((s, r) => s + r.total_revenue, 0),
  })).sort((a, b) => b.rev - a.rev)

  const topCatShare = (catRevenue[0].rev / totalRevenue) * 100
  const topCatSlowMovers = catRows(catRevenue[0].cat)
    .filter((r) => r.sell_through_rate < 40 && !alreadyMarkdownSkus.has(r.sku_id))
    .sort((a, b) => a.sell_through_rate - b.sell_through_rate)
    .slice(0, 2)

  const concentrationMutations: Mutation[] = topCatSlowMovers.flatMap((r) => [
    { sku_id: r.sku_id, field: 'retail_price', operation: 'multiply', value: 0.88 },
    { sku_id: r.sku_id, field: 'markdown_pct', operation: 'set', value: 12 },
    { sku_id: r.sku_id, field: 'status', operation: 'set', value: 'on_markdown' },
  ])

  // ─────────────────────────────────────────────
  // Card 8: High-value SKU loyalty pricing
  // ─────────────────────────────────────────────
  const avgPrice = rows.reduce((s, r) => s + r.retail_price, 0) / rows.length
  const premiumSkus = rows
    .filter((r) => r.retail_price >= avgPrice * 2 && r.sell_through_rate > 50)
    .sort((a, b) => b.retail_price - a.retail_price)
    .slice(0, 3)

  const loyaltyMutations: Mutation[] = premiumSkus.flatMap((r) => [
    { sku_id: r.sku_id, field: 'retail_price', operation: 'multiply', value: 0.93 },
    { sku_id: r.sku_id, field: 'status', operation: 'set', value: 'loyalty-priced' },
  ])

  const loyaltyInvValue = premiumSkus.reduce((s, r) => s + r.inventory_value, 0)

  // ─────────────────────────────────────────────
  // Build cards
  // ─────────────────────────────────────────────
  const allSkusSummary = rows
    .map((r) => `${r.sku_id} (${r.name}, $${r.retail_price}, stock: ${r.current_stock}, sell-through: ${r.sell_through_rate.toFixed(0)}%, ${r.status})`)
    .join('\n')

  const cards: ActionCard[] = [
    {
      id: 'slow-movers',
      severity: 'red',
      agentSource: 'Markdown Agent',
      title: `${slowCat.cat} Sell-Through at ${pct(slowCat.avg)} — Mark Down ${slowMovers.length} SKUs`,
      impact: `${usd(slowMoverInvValue)} at risk · projected ${usd(projectedRecovery)} recovery at 85% of cost`,
      context: `${slowCat.cat} category is averaging ${pct(slowCat.avg)} sell-through, the worst-performing category. The ${slowMovers.length} slowest-moving SKUs (${slowMovers.map((r) => r.sku_id).join(', ')}) collectively hold ${usd(slowMoverInvValue)} in inventory. A 15% markdown would move sell-through toward plan.`,
      dataSummary: `Slow movers: ${slowMovers.map((r) => `${r.sku_id}: ${usd(r.retail_price)}, ${r.current_stock} units, ${r.sell_through_rate.toFixed(0)}% sell-through, ${r.weeks_of_supply.toFixed(1)}wks supply`).join(' | ')}. Category avg sell-through: ${pct(slowCat.avg)}.`,
      mutations: slowMoverMutations,
      affectedSkus: slowMovers.map((r) => r.sku_id),
    },
    {
      id: 'excess-inventory',
      severity: 'red',
      agentSource: 'Markdown Agent',
      title: `${excessInv.length} SKUs Carrying 16+ Weeks Supply — Clearance Required`,
      impact: `${usd(excessInvValue)} tied up · 20% markdown frees capital before season end`,
      context: `These ${excessInv.length} SKUs (${excessInv.map((r) => r.sku_id).join(', ')}) have ${excessInv.map((r) => `${r.weeks_of_supply.toFixed(0)}wks`).join(', ')} of supply respectively, far exceeding the 8-week target. A 20% markdown applied now recovers more margin than a deeper clearance in 6 weeks.`,
      dataSummary: `Excess inventory SKUs: ${excessInv.map((r) => `${r.sku_id}: ${r.current_stock} units, ${r.weeks_of_supply.toFixed(1)} wks supply, ${usd(r.inventory_value)} value, ${r.sell_through_rate.toFixed(0)}% sell-through`).join(' | ')}.`,
      mutations: excessMutations,
      affectedSkus: excessInv.map((r) => r.sku_id),
    },
    {
      id: 'elec-price-tiers',
      severity: 'amber',
      agentSource: 'Pricing Agent',
      title: `Electronics ${elecSpreadX}× Price Spread — Bundle Low-Ticket SKUs`,
      impact: `Budget tier avg ${usd(elecLowAOV)} vs premium ${usd(elecHighAOV)} · 10% promotion closes gap`,
      context: `Electronics contains a ${elecSpreadX}× price spread between budget (<$100) and premium (≥$300) items. Budget tier transactions average ${usd(elecLowAOV)} — a 10% promotional price on ${elecLow.slice(0, 2).map((r) => r.sku_id).join(' and ')} would drive attach-rate with premium purchases and lift category AOV.`,
      dataSummary: `Electronics budget SKUs: ${elecLow.map((r) => `${r.sku_id}: ${usd(r.retail_price)}, ${r.transaction_count} tx`).join(', ')}. Premium SKUs: ${elecHigh.map((r) => `${r.sku_id}: ${usd(r.retail_price)}`).join(', ')}.`,
      mutations: elecBundleMutations,
      affectedSkus: elecLow.slice(0, 2).map((r) => r.sku_id),
    },
    {
      id: 'margin-compression',
      severity: onMarkdown.length > 0 ? 'amber' : 'green',
      agentSource: 'Pricing Agent',
      title: onMarkdown.length > 0
        ? `Margin Gap: Active Markdowns Running ${(avgMarginNormal - avgMarginMarkdown).toFixed(1)}pts Below Full-Price`
        : 'Margin Profile Healthy — No Active Compression',
      impact: onMarkdown.length > 0
        ? `${onMarkdown.length} SKUs on markdown avg ${pct(avgMarginMarkdown)} margin vs ${pct(avgMarginNormal)} full-price`
        : `Avg margin ${pct(avgMarginNormal)} across all ${rows.length} SKUs`,
      context: onMarkdown.length > 0
        ? `${onMarkdown.length} SKUs on markdown are running ${(avgMarginNormal - avgMarginMarkdown).toFixed(1)} margin points below full-price SKUs (${pct(avgMarginMarkdown)} vs ${pct(avgMarginNormal)}). ${marginRecoverySkus.length > 0 ? `SKUs ${marginRecoverySkus.map((r) => r.sku_id).join(', ')} have improved sell-through and can absorb a 5% price recovery.` : 'Monitor for recovery opportunities as sell-through improves.'}`
        : `All ${rows.length} SKUs are at full price with an average gross margin of ${pct(avgMarginNormal)}. No margin compression detected.`,
      dataSummary: `Markdown SKUs: ${onMarkdown.length}. Avg margin on markdown: ${pct(avgMarginMarkdown)}. Avg margin at full price: ${pct(avgMarginNormal)}. Recovery candidates: ${marginRecoverySkus.map((r) => `${r.sku_id} (${r.sell_through_rate.toFixed(0)}% ST)`).join(', ') || 'none'}.`,
      mutations: marginRecoveryMutations,
      affectedSkus: marginRecoverySkus.map((r) => r.sku_id),
    },
    {
      id: 'beauty-bundling',
      severity: 'green',
      agentSource: 'Assortment Agent',
      title: 'Beauty Multi-Buy Signal — Formalise Bundle Pricing',
      impact: `Beauty avg ${beautyAvgQty.toFixed(1)} units/tx vs ${platformAvgQty.toFixed(1)} platform — 5% discount activates sets`,
      context: `Beauty customers organically purchase ${beautyAvgQty.toFixed(1)} units per transaction — significantly above the platform average of ${platformAvgQty.toFixed(1)}. A 5% promotional price on the top multi-buy SKUs (${beautyBundleTargets.map((r) => r.sku_id).join(', ')}) would formalise this behaviour into a "build your routine" set, lifting both basket size and repeat rate.`,
      dataSummary: `Beauty SKUs avg qty/tx: ${beautyRows.map((r) => `${r.sku_id}: ${r.avg_qty_per_tx.toFixed(1)}`).join(', ')}. Clothing avg: ${clothingRows.length ? (clothingRows.reduce((s, r) => s + r.avg_qty_per_tx, 0) / clothingRows.length).toFixed(1) : 'N/A'}. Platform avg: ${platformAvgQty.toFixed(1)}.`,
      mutations: beautyBundleMutations,
      affectedSkus: beautyBundleTargets.map((r) => r.sku_id),
    },
    {
      id: 'fast-movers',
      severity: fastMovers.length > 0 ? 'amber' : 'green',
      agentSource: 'Assortment Agent',
      title: fastMovers.length > 0
        ? `${fastMovers.length} Fast-Moving SKUs Under 4 Weeks Supply — Price Up Before Stockout`
        : 'Fast-Mover Inventory Levels Adequate',
      impact: fastMovers.length > 0
        ? `${fastMovers.map((r) => r.sku_id).join(', ')} · avg ${(fastMovers.reduce((s, r) => s + r.weeks_of_supply, 0) / fastMovers.length).toFixed(1)} wks remaining · 8% price increase improves margin`
        : 'No stockout risk detected in current SKU portfolio',
      context: fastMovers.length > 0
        ? `${fastMovers.map((r) => `${r.sku_id} (${r.weeks_of_supply.toFixed(1)} wks, ${r.sell_through_rate.toFixed(0)}% ST)`).join(', ')} are selling down fast. An 8% price increase captures demand while supply lasts, and signals scarcity to drive conversion on the remaining stock.`
        : 'All fast-moving SKUs currently have adequate supply buffers. Re-run in 7 days.',
      dataSummary: `Fast movers (<4wks, >75% ST): ${fastMovers.map((r) => `${r.sku_id}: ${r.current_stock} units, ${r.weeks_of_supply.toFixed(1)} wks, ${r.sell_through_rate.toFixed(0)}% ST, ${usd(r.retail_price)}`).join(' | ') || 'none'}.`,
      mutations: fastMoverMutations,
      affectedSkus: fastMovers.map((r) => r.sku_id),
    },
    {
      id: 'concentration-risk',
      severity: topCatShare > 45 ? 'amber' : 'green',
      agentSource: 'Risk Agent',
      title: `${catRevenue[0].cat} Drives ${pct(topCatShare)} of Revenue — Concentration Risk`,
      impact: `${usd(catRevenue[0].rev)} of ${usd(totalRevenue)} in one category · diversify via under-performers`,
      context: `${catRevenue[0].cat} represents ${pct(topCatShare)} of total historical revenue (${usd(catRevenue[0].rev)}). Over-reliance on a single category is a margin and demand risk. Stimulating ${topCatSlowMovers.length > 0 ? `${topCatSlowMovers.map((r) => r.sku_id).join(' and ')} with 12% markdown` : 'the under-performing secondary categories'} would rebalance the revenue mix and reduce volatility.`,
      dataSummary: `Category revenue share: ${catRevenue.map((c) => `${c.cat}: ${usd(c.rev)} (${((c.rev / totalRevenue) * 100).toFixed(1)}%)`).join(', ')}. Top category slow movers: ${topCatSlowMovers.map((r) => `${r.sku_id}: ${r.sell_through_rate.toFixed(0)}% ST`).join(', ') || 'none'}.`,
      mutations: concentrationMutations,
      affectedSkus: topCatSlowMovers.map((r) => r.sku_id),
    },
    {
      id: 'loyalty-pricing',
      severity: 'green',
      agentSource: 'Pricing Agent',
      title: `${premiumSkus.length} Premium SKUs Eligible for Loyalty Pricing`,
      impact: `${usd(loyaltyInvValue)} in high-velocity premium stock · 7% loyalty discount drives repeat`,
      context: `${premiumSkus.length} premium SKUs (${premiumSkus.map((r) => r.sku_id).join(', ')}) are selling well (>50% sell-through) at high price points. Offering a 7% loyalty discount converts one-time buyers into programme members. At ${usd(loyaltyInvValue)} in current inventory, the margin trade-off is covered by the LTV of a loyalty registration.`,
      dataSummary: `Premium SKUs: ${premiumSkus.map((r) => `${r.sku_id}: ${usd(r.retail_price)}, ${r.sell_through_rate.toFixed(0)}% ST, ${r.current_stock} units`).join(' | ')}. Avg platform price: ${usd(avgPrice)}.`,
      mutations: loyaltyMutations,
      affectedSkus: premiumSkus.map((r) => r.sku_id),
    },
  ]

  const datasetSummary = [
    `Live product catalog: ${rows.length} SKUs across ${cats.length} categories (${cats.join(', ')}).`,
    `Total inventory value: ${usd(totalInvValue)}. Historical revenue: ${usd(totalRevenue)}.`,
    `Category inventory: ${cats.map((c) => `${c}: ${usd(catRows(c).reduce((s, r) => s + r.inventory_value, 0))}`).join(', ')}.`,
    `SKUs by status: ${['active', 'on_markdown', 'loyalty-priced'].map((s) => `${s}: ${rows.filter((r) => r.status === s).length}`).join(', ')}.`,
    `Sell-through range: ${Math.min(...rows.map((r) => r.sell_through_rate)).toFixed(0)}%–${Math.max(...rows.map((r) => r.sell_through_rate)).toFixed(0)}%.`,
    allSkusSummary,
  ].join('\n')

  return {
    cards,
    datasetSummary,
    actionLogSummary: buildActionLogSummary(logs),
  }
}
