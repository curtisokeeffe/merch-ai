import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()

    const pendingActions = (db.prepare(
      "SELECT COUNT(*) as c FROM action_queue WHERE status = 'pending'"
    ).get() as { c: number }).c

    const criticalSignals = (db.prepare(
      "SELECT COUNT(*) as c FROM performance_signals WHERE severity = 'critical' AND status != 'resolved'"
    ).get() as { c: number }).c

    const avgConfidenceRow = db.prepare(
      "SELECT AVG(confidence) as avg FROM pricing_recommendations WHERE status = 'pending'"
    ).get() as { avg: number | null }
    const avgConfidence = avgConfidenceRow.avg ?? 0

    const actions = db.prepare(`
      SELECT * FROM action_queue
      WHERE status = 'pending'
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        confidence DESC
      LIMIT 10
    `).all()

    const latestBrief = db.prepare(`
      SELECT * FROM daily_briefs ORDER BY generated_at DESC LIMIT 1
    `).get() ?? null

    const topSignals = db.prepare(`
      SELECT * FROM performance_signals
      WHERE status != 'resolved'
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        detected_at DESC
      LIMIT 3
    `).all()

    return NextResponse.json({
      pendingActions,
      criticalSignals,
      avgConfidence,
      actions,
      latestBrief,
      topSignals,
    })
  } catch (err) {
    console.error('Dashboard GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id, action } = await req.json()
    const db = getDb()

    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    db.prepare(
      "UPDATE action_queue SET status = ?, actioned_at = ? WHERE id = ?"
    ).run(newStatus, new Date().toISOString(), id)

    return NextResponse.json({ ok: true, id, status: newStatus })
  } catch (err) {
    console.error('Dashboard POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
