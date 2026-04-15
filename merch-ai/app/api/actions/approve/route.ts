import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { computeKPIs, formatKPIs } from '@/lib/kpis'
import type { Mutation } from '@/lib/insights'
import type { ProductRow } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ALLOWED_MUTATION_FIELDS = new Set<string>([
  'retail_price',
  'markdown_pct',
  'status',
  'current_stock',
])

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
    const { card }: ApproveBody = await req.json()

    const invalidMutation = card.mutations.find((m) => !ALLOWED_MUTATION_FIELDS.has(m.field))
    if (invalidMutation) {
      return NextResponse.json(
        { error: `Unsupported mutation field: ${invalidMutation.field}` },
        { status: 400 },
      )
    }

    const actionId = `${card.id}-${Date.now()}`
    const changeRecord: { sku_id: string; field: string; before: unknown; after: unknown }[] = []

    // Snapshot full product state BEFORE any mutations fire
    const beforeSnapshot = card.affectedSkus
      .map((skuId) => db.prepare('SELECT * FROM live_products WHERE sku_id = ?').get(skuId))
      .filter(Boolean) as ProductRow[]

    db.transaction(() => {
      // Apply each mutation
      for (const mutation of card.mutations) {
        const row = db.prepare('SELECT * FROM live_products WHERE sku_id = ?').get(mutation.sku_id) as ProductRow | undefined
        if (!row) continue

        const before = row[mutation.field as keyof ProductRow]
        let after: number | string

        if (mutation.operation === 'multiply')      after = (before as number) * (mutation.value as number)
        else if (mutation.operation === 'set')       after = mutation.value as number | string
        else if (mutation.operation === 'add')       after = (before as number) + (mutation.value as number)
        else continue

        db.prepare(`UPDATE live_products SET "${mutation.field}" = ? WHERE sku_id = ?`).run(after, mutation.sku_id)
        changeRecord.push({ sku_id: mutation.sku_id, field: mutation.field, before, after })
      }

      // Recompute inventory_value for affected SKUs
      for (const skuId of [...new Set(card.mutations.map((m) => m.sku_id))]) {
        db.prepare('UPDATE live_products SET inventory_value = current_stock * retail_price WHERE sku_id = ?').run(skuId)
      }

      // Write action log with full before snapshot
      db.prepare(`
        INSERT INTO action_log
          (action_id, agent_source, action_type, title, affected_skus, mutations, changes_made, before_snapshot, approved_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
      `).run(
        actionId,
        card.agentSource,
        card.id,
        card.title,
        JSON.stringify(card.affectedSkus),
        JSON.stringify(card.mutations),
        JSON.stringify(changeRecord),
        JSON.stringify(beforeSnapshot),
        new Date().toISOString(),
      )
    })()

    const updatedKPIs = computeKPIs(db)
    return NextResponse.json({ ok: true, actionId, kpis: formatKPIs(updatedKPIs), changes: changeRecord })
  } catch (err) {
    console.error('Approve error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
