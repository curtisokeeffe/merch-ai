import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()

    const signals = db.prepare(`
      SELECT * FROM performance_signals
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        detected_at DESC
    `).all()

    const sources = [
      { id: 'shopify',    name: 'Shopify',       connected: true,  lastSync: new Date(Date.now() - 3600000).toISOString(),  color: '#10B981' },
      { id: 'netsuite',   name: 'NetSuite',      connected: true,  lastSync: new Date(Date.now() - 7200000).toISOString(),  color: '#3B82F6' },
      { id: 'lightspeed', name: 'Lightspeed',    connected: false, lastSync: null,                                          color: '#EF4444' },
      { id: 'sheets',     name: 'Google Sheets', connected: true,  lastSync: new Date(Date.now() - 1800000).toISOString(),  color: '#F59E0B' },
    ]

    return NextResponse.json({ signals, sources })
  } catch (err) {
    console.error('Performance GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
