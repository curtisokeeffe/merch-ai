import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()

    const recommendations = db.prepare(`
      SELECT mr.*, p.name as product_name, p.category
      FROM markdown_recommendations mr
      JOIN products p ON mr.sku_id = p.sku_id
      ORDER BY mr.urgency_score DESC
    `).all()

    const scenarios = db.prepare(`
      SELECT * FROM promotion_scenarios ORDER BY created_at DESC
    `).all()

    return NextResponse.json({ recommendations, scenarios })
  } catch (err) {
    console.error('Promotions GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
