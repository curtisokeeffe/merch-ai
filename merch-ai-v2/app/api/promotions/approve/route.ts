import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { id, action } = await req.json()
    const db = getDb()

    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      schedule: 'scheduled',
    }
    const newStatus = statusMap[action] ?? action

    db.prepare(
      "UPDATE markdown_recommendations SET status = ?, actioned_at = ? WHERE id = ?"
    ).run(newStatus, new Date().toISOString(), id)

    return NextResponse.json({ ok: true, id, status: newStatus })
  } catch (err) {
    console.error('Promotions approve error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
