import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const db = getDb()
    db.prepare('DELETE FROM connections WHERE id = ?').run(params.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[connections/id] DELETE error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
