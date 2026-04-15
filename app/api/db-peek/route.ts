import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = getDb()
    const products = db.prepare('SELECT * FROM live_products ORDER BY category, name').all()

    // Collect all SKU IDs that appear in approved action logs
    const approvedLogs = db
      .prepare("SELECT affected_skus FROM action_log WHERE status = 'approved'")
      .all() as { affected_skus: string }[]

    const changedSkus = [
      ...new Set(
        approvedLogs.flatMap((row) => {
          try { return JSON.parse(row.affected_skus) as string[] }
          catch { return [] }
        })
      ),
    ]

    return NextResponse.json({ products, changedSkus })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
