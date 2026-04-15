import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { id, action } = await req.json()
    const db = getDb()

    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    db.prepare(
      "UPDATE pricing_recommendations SET status = ?, actioned_at = ? WHERE id = ?"
    ).run(newStatus, new Date().toISOString(), id)

    return NextResponse.json({ ok: true, id, status: newStatus })
  } catch (err) {
    console.error('Pricing approve error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
