import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { id, action } = await req.json()
    const db = getDb()

    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      publish: 'published',
    }

    const newStatus = statusMap[action] ?? 'draft'
    const publishedAt = action === 'publish' ? new Date().toISOString() : null

    if (publishedAt) {
      db.prepare(
        "UPDATE content_drafts SET status = ?, published_at = ? WHERE id = ?"
      ).run(newStatus, publishedAt, id)
    } else {
      db.prepare(
        "UPDATE content_drafts SET status = ? WHERE id = ?"
      ).run(newStatus, id)
    }

    return NextResponse.json({ ok: true, id, status: newStatus })
  } catch (err) {
    console.error('Content publish error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
