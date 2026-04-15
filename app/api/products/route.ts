import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import type { ProductRow } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const db = getDb()

    // Get categories for filter options
    const categories = [...new Set(
      (db.prepare('SELECT DISTINCT category FROM live_products ORDER BY category').all() as { category: string }[])
        .map((r) => r.category)
    )]

    // Fetch products with optional filtering
    let query = 'SELECT * FROM live_products'
    const params: any[] = []

    if (category && category !== 'all') {
      query += ' WHERE category = ?'
      params.push(category)
    }

    query += ' ORDER BY category, name'

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM live_products'
    if (category && category !== 'all') {
      countQuery += ' WHERE category = ?'
    }
    const countResult = db.prepare(countQuery).get(...params) as { total: number }
    const total = countResult.total

    // Apply pagination
    query += ' LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const products = db.prepare(query).all(...params) as ProductRow[]

    return NextResponse.json({
      products,
      categories,
      total,
      currentCategory: category || 'all',
      limit,
      offset,
      pages: Math.ceil(total / limit),
      currentPage: Math.floor(offset / limit) + 1,
    })
  } catch (err) {
    console.error('[products] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
