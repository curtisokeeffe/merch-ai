import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { id, action } = await req.json()
    const db = getDb()

    const statusMap: Record<string, string> = {
      acknowledge: 'acknowledged',
      resolve: 'resolved',
    }
    const newStatus = statusMap[action] ?? 'acknowledged'

    db.prepare(
      "UPDATE performance_signals SET status = ? WHERE id = ?"
    ).run(newStatus, id)

    return NextResponse.json({ ok: true, id, status: newStatus })
  } catch (err) {
    console.error('Performance approve error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
