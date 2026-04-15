import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()

    const products = db.prepare(`
      SELECT
        p.*,
        cd.id as draft_id,
        cd.title as draft_title,
        cd.description as draft_description,
        cd.bullets as draft_bullets,
        cd.seo_title as draft_seo_title,
        cd.seo_description as draft_seo_description,
        cd.tags as draft_tags,
        cd.collection_suggestions as draft_collection_suggestions,
        cd.status as draft_status,
        cd.generated_at as draft_generated_at,
        cd.published_at as draft_published_at
      FROM products p
      LEFT JOIN content_drafts cd ON p.sku_id = cd.sku_id
      WHERE p.status = 'active'
      ORDER BY p.category, p.name
    `).all()

    const counts = {
      total: 0,
      needs_content: 0,
      draft: 0,
      approved: 0,
      published: 0,
    }

    for (const p of products as Array<{ draft_status?: string }>) {
      counts.total++
      if (!p.draft_status) counts.needs_content++
      else if (p.draft_status === 'draft') counts.draft++
      else if (p.draft_status === 'approved') counts.approved++
      else if (p.draft_status === 'published') counts.published++
    }

    return NextResponse.json({ products, counts })
  } catch (err) {
    console.error('Content GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
