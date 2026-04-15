import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import type { ProductRow, ActionLogRow } from '@/lib/db'

export const dynamic = 'force-dynamic'

function usd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function pct(n: number) { return `${n.toFixed(1)}%` }

function delta(before: number, after: number) {
  if (before === 0) return { abs: after - before, rel: 0, dir: 'neutral' as const }
  const rel = ((after - before) / Math.abs(before)) * 100
  return { abs: after - before, rel, dir: rel > 0 ? 'up' as const : rel < 0 ? 'down' as const : 'neutral' as const }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const actionId = searchParams.get('actionId')

    const db = getDb()

    if (actionId) {
      // Single action impact
      const row = db.prepare('SELECT * FROM action_log WHERE action_id = ?').get(actionId) as ActionLogRow & { before_snapshot: string } | undefined
      if (!row) return NextResponse.json({ error: 'Action not found' }, { status: 404 })

      const beforeSnapshot: ProductRow[] = JSON.parse(row.before_snapshot || '[]')
      const affectedSkus: string[] = JSON.parse(row.affected_skus || '[]')

      const currentRows = affectedSkus
        .map((skuId) => db.prepare('SELECT * FROM live_products WHERE sku_id = ?').get(skuId) as ProductRow | undefined)
        .filter(Boolean) as ProductRow[]

      const skuImpacts = affectedSkus.map((skuId) => {
        const before = beforeSnapshot.find((p) => p.sku_id === skuId)
        const current = currentRows.find((p) => p.sku_id === skuId)
        if (!before || !current) return null

        const priceΔ = delta(before.retail_price, current.retail_price)
        const marginBefore = before.retail_price > 0 ? ((before.retail_price - before.cost_price) / before.retail_price) * 100 : 0
        const marginCurrent = current.retail_price > 0 ? ((current.retail_price - current.cost_price) / current.retail_price) * 100 : 0
        const marginΔ = delta(marginBefore, marginCurrent)
        const invValueΔ = delta(before.inventory_value, current.inventory_value)
        const sellThroughΔ = delta(before.sell_through_rate, current.sell_through_rate)
        const stockΔ = delta(before.current_stock, current.current_stock)

        return {
          sku_id: skuId,
          name: current.name,
          category: current.category,
          before: {
            price: before.retail_price,
            margin_pct: marginBefore,
            markdown_pct: before.markdown_pct,
            status: before.status,
            inventory_value: before.inventory_value,
            sell_through_rate: before.sell_through_rate,
            current_stock: before.current_stock,
          },
          current: {
            price: current.retail_price,
            margin_pct: marginCurrent,
            markdown_pct: current.markdown_pct,
            status: current.status,
            inventory_value: current.inventory_value,
            sell_through_rate: current.sell_through_rate,
            current_stock: current.current_stock,
          },
          deltas: {
            price: { ...priceΔ, formatted: `${priceΔ.dir === 'down' ? '-' : priceΔ.dir === 'up' ? '+' : ''}${usd(Math.abs(priceΔ.abs))} (${priceΔ.rel.toFixed(1)}%)` },
            margin: { ...marginΔ, formatted: `${marginΔ.rel > 0 ? '+' : ''}${marginΔ.abs.toFixed(1)}pts` },
            inventory_value: { ...invValueΔ, formatted: `${invValueΔ.dir === 'down' ? '-' : '+'}${usd(Math.abs(invValueΔ.abs))}` },
            sell_through: { ...sellThroughΔ, formatted: `${sellThroughΔ.rel > 0 ? '+' : ''}${sellThroughΔ.abs.toFixed(1)}pts` },
            stock: { ...stockΔ, formatted: `${stockΔ.abs > 0 ? '+' : ''}${stockΔ.abs} units` },
          },
        }
      }).filter(Boolean)

      // Portfolio-level summary across all affected SKUs
      const totalInvBefore = beforeSnapshot.reduce((s, p) => s + p.inventory_value, 0)
      const totalInvCurrent = currentRows.reduce((s, p) => s + p.inventory_value, 0)
      const avgPriceBefore = beforeSnapshot.length ? beforeSnapshot.reduce((s, p) => s + p.retail_price, 0) / beforeSnapshot.length : 0
      const avgPriceCurrent = currentRows.length ? currentRows.reduce((s, p) => s + p.retail_price, 0) / currentRows.length : 0
      const avgSTBefore = beforeSnapshot.length ? beforeSnapshot.reduce((s, p) => s + p.sell_through_rate, 0) / beforeSnapshot.length : 0
      const avgSTCurrent = currentRows.length ? currentRows.reduce((s, p) => s + p.sell_through_rate, 0) / currentRows.length : 0

      return NextResponse.json({
        actionId: row.action_id,
        title: row.title,
        agentSource: row.agent_source,
        approvedAt: row.approved_at,
        skuCount: affectedSkus.length,
        skuImpacts,
        summary: {
          inventoryValue: { before: totalInvBefore, current: totalInvCurrent, delta: totalInvCurrent - totalInvBefore },
          avgPrice: { before: avgPriceBefore, current: avgPriceCurrent, delta: avgPriceCurrent - avgPriceBefore },
          avgSellThrough: { before: avgSTBefore, current: avgSTCurrent, delta: avgSTCurrent - avgSTBefore },
        },
        fetchedAt: new Date().toISOString(),
      })
    }

    // All actions summary (for Changes page overview)
    const actions = db.prepare(`
      SELECT action_id, agent_source, title, affected_skus, approved_at, before_snapshot
      FROM action_log WHERE status = 'approved' ORDER BY approved_at DESC
    `).all() as (ActionLogRow & { before_snapshot: string })[]

    const summaries = actions.map((row) => {
      const before: ProductRow[] = JSON.parse(row.before_snapshot || '[]')
      const skus: string[] = JSON.parse(row.affected_skus || '[]')
      const current = skus
        .map((id) => db.prepare('SELECT inventory_value, sell_through_rate FROM live_products WHERE sku_id = ?').get(id) as Pick<ProductRow, 'inventory_value' | 'sell_through_rate'> | undefined)
        .filter(Boolean) as Pick<ProductRow, 'inventory_value' | 'sell_through_rate'>[]

      const invBefore = before.reduce((s, p) => s + p.inventory_value, 0)
      const invCurrent = current.reduce((s, p) => s + p.inventory_value, 0)
      const stBefore = before.length ? before.reduce((s, p) => s + p.sell_through_rate, 0) / before.length : 0
      const stCurrent = current.length ? current.reduce((s, p) => s + p.sell_through_rate, 0) / current.length : 0

      return {
        actionId: row.action_id,
        title: row.title,
        agentSource: row.agent_source,
        approvedAt: row.approved_at,
        skuCount: skus.length,
        invDelta: invCurrent - invBefore,
        stDelta: stCurrent - stBefore,
        hasSnapshot: before.length > 0,
      }
    })

    return NextResponse.json({ summaries })
  } catch (err) {
    console.error('[impact] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
