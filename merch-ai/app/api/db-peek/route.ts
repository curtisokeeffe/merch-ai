import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import type { ActionLogRow } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM live_products ORDER BY sku_id').all() as Record<string, unknown>[]
    const logs = db.prepare("SELECT affected_skus FROM action_log WHERE status = 'approved'").all() as Pick<ActionLogRow, 'affected_skus'>[]

    const changedSkus = [...new Set(logs.flatMap((l) => {
      try {
        return JSON.parse(l.affected_skus) as string[]
      } catch {
        return []
      }
    }))]

    const columns = rows.length ? Object.keys(rows[0]) : []
    return NextResponse.json({ columns, rows, changedSkus })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
