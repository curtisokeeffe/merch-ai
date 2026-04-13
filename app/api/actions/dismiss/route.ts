import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    const { card } = await req.json()

    const actionId = `${card.id}-dismiss-${Date.now()}`
    db.prepare(`
      INSERT INTO action_log (action_id, agent_source, action_type, title, affected_skus, mutations, changes_made, approved_at, status)
      VALUES (?, ?, ?, ?, ?, '[]', '[]', ?, 'dismissed')
    `).run(
      actionId,
      card.agentSource,
      card.id,
      card.title,
      JSON.stringify(card.affectedSkus),
      new Date().toISOString(),
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
