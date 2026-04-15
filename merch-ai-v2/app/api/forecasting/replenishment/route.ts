import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { id, action } = await req.json()
    const db = getDb()

    const statusMap: Record<string, string> = {
      submit: 'submitted',
      cancel: 'cancelled',
    }
    const newStatus = statusMap[action] ?? 'draft'
    const submittedAt = action === 'submit' ? new Date().toISOString() : null

    if (submittedAt) {
      db.prepare(
        "UPDATE replenishment_orders SET status = ?, submitted_at = ? WHERE id = ?"
      ).run(newStatus, submittedAt, id)
    } else {
      db.prepare(
        "UPDATE replenishment_orders SET status = ? WHERE id = ?"
      ).run(newStatus, id)
    }

    return NextResponse.json({ ok: true, id, status: newStatus })
  } catch (err) {
    console.error('Replenishment error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
