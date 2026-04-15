import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import type { ActionLogRow } from '@/lib/db'

export const dynamic = 'force-dynamic'

export interface ChangeEntry {
  actionId: string
  agentSource: string
  title: string
  status: string
  approvedAt: string | null
  mutations: { sku_id: string; field: string; before: unknown; after: unknown }[]
  affectedSkus: string[]
}

export async function GET() {
  try {
    const db = getDb()
    const logs = db.prepare('SELECT * FROM action_log ORDER BY approved_at DESC').all() as ActionLogRow[]

    const entries: ChangeEntry[] = logs.map((log) => ({
      actionId: log.action_id,
      agentSource: log.agent_source,
      title: log.title,
      status: log.status,
      approvedAt: log.approved_at,
      mutations: JSON.parse(log.changes_made) as { sku_id: string; field: string; before: unknown; after: unknown }[],
      affectedSkus: JSON.parse(log.affected_skus) as string[],
    }))

    return NextResponse.json({ changes: entries })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
