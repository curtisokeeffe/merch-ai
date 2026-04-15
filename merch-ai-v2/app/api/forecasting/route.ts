import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()

    const forecasts = db.prepare(`
      SELECT f.*, p.name as product_name, p.category, p.current_stock,
             p.weeks_of_supply, p.cost_price, p.retail_price
      FROM forecasts f
      JOIN products p ON f.sku_id = p.sku_id
      WHERE f.period = '2026-Q2'
      ORDER BY p.weeks_of_supply ASC
    `).all()

    const replenishmentOrders = db.prepare(`
      SELECT r.*, p.name as product_name, p.category
      FROM replenishment_orders r
      JOIN products p ON r.sku_id = p.sku_id
      ORDER BY
        CASE r.urgency WHEN 'urgent' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        r.created_at DESC
    `).all()

    const alerts = db.prepare(`
      SELECT COUNT(*) as c FROM replenishment_orders
      WHERE urgency = 'urgent' AND status = 'draft'
    `).get() as { c: number }

    return NextResponse.json({
      forecasts,
      replenishmentOrders,
      urgentAlerts: alerts.c,
    })
  } catch (err) {
    console.error('Forecasting GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
