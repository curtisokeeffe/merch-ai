import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()

    const recommendations = db.prepare(`
      SELECT pr.*, p.name as product_name, p.category
      FROM pricing_recommendations pr
      JOIN products p ON pr.sku_id = p.sku_id
      ORDER BY
        CASE pr.status WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
        ABS(pr.change_pct) DESC
    `).all()

    const guardrails = db.prepare(`
      SELECT pg.*, p.name as product_name
      FROM pricing_guardrails pg
      JOIN products p ON pg.sku_id = p.sku_id
      ORDER BY p.name
    `).all()

    return NextResponse.json({ recommendations, guardrails })
  } catch (err) {
    console.error('Pricing GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
