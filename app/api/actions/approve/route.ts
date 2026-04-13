import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { computeKPIs, formatKPIs } from '@/lib/kpis'
import type { Mutation } from '@/lib/insights'
import type { ProductRow } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface ApproveBody {
  card: {
    id: string
    title: string
    agentSource: string
    mutations: Mutation[]
    affectedSkus: string[]
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    const body: ApproveBody = await req.json()
    const { card } = body

    const changeRecord: { sku_id: string; field: string; before: unknown; after: unknown }[] = []

    const applyMutations = db.transaction(() => {
      for (const mutation of card.mutations) {
        const row = db
          .prepare('SELECT * FROM live_products WHERE sku_id = ?')
          .get(mutation.sku_id) as ProductRow | undefined

        if (!row) continue

        const before = row[mutation.field as keyof ProductRow]
        let after: number | string

        if (mutation.operation === 'multiply') {
          after = (before as number) * (mutation.value as number)
        } else if (mutation.operation === 'set') {
          after = mutation.value as number | string
        } else if (mutation.operation === 'add') {
          after = (before as number) + (mutation.value as number)
        } else {
          continue
        }

        db.prepare(`UPDATE live_products SET "${mutation.field}" = ? WHERE sku_id = ?`).run(after, mutation.sku_id)
        changeRecord.push({ sku_id: mutation.sku_id, field: mutation.field, before, after })
      }

      // Recompute inventory_value for every affected SKU after price changes
      const affectedSet = [...new Set(card.mutations.map((m) => m.sku_id))]
      for (const skuId of affectedSet) {
        db.prepare(
          'UPDATE live_products SET inventory_value = current_stock * retail_price WHERE sku_id = ?'
        ).run(skuId)
      }

      // Log to action_log
      const actionId = `${card.id}-${Date.now()}`
      db.prepare(`
        INSERT INTO action_log (action_id, agent_source, action_type, title, affected_skus, mutations, changes_made, approved_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')
      `).run(
        actionId,
        card.agentSource,
        card.id,
        card.title,
        JSON.stringify(card.affectedSkus),
        JSON.stringify(card.mutations),
        JSON.stringify(changeRecord),
        new Date().toISOString(),
      )
    })

    applyMutations()

    const updatedKPIs = computeKPIs(db)
    return NextResponse.json({ ok: true, kpis: formatKPIs(updatedKPIs), changes: changeRecord })
  } catch (err) {
    console.error('Approve error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
