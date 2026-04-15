import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { sku_id, min_price, max_price, max_change_pct, floor_margin_pct } = await req.json()
    const db = getDb()

    db.prepare(`
      INSERT INTO pricing_guardrails (sku_id, min_price, max_price, max_change_pct, floor_margin_pct)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(sku_id) DO UPDATE SET
        min_price = excluded.min_price,
        max_price = excluded.max_price,
        max_change_pct = excluded.max_change_pct,
        floor_margin_pct = excluded.floor_margin_pct
    `).run(sku_id, min_price, max_price, max_change_pct, floor_margin_pct)

    return NextResponse.json({ ok: true, sku_id })
  } catch (err) {
    console.error('Pricing guardrails error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
