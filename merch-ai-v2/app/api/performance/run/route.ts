import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { callClaude } from '@/lib/claude'

export async function POST() {
  try {
    const db = getDb()

    const signals = db.prepare(`
      SELECT * FROM performance_signals
      WHERE status != 'resolved'
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
      LIMIT 8
    `).all() as Array<{
      id: string; signal_type: string; title: string; description: string;
      recommendation: string; impact: string; severity: string; source: string;
    }>

    const signalText = signals.map((s, i) =>
      `${i + 1}. [${s.severity.toUpperCase()}] ${s.title}\n   ${s.description}\n   Recommendation: ${s.recommendation}\n   Impact: ${s.impact}`
    ).join('\n\n')

    const systemPrompt = `You are a merchandising intelligence agent. Analyze these performance signals and produce a prioritized daily brief for a fashion retail merchant. Format: executive summary (2-3 sentences), then ranked action items with specific recommendations. Be concise and actionable.`

    const userMessage = `Today's active performance signals:\n\n${signalText}\n\nGenerate a daily brief with executive summary and top prioritized actions.`

    const summary = await callClaude(systemPrompt, userMessage, 600)

    const briefId = `BRIEF-${Date.now()}`
    const criticalCount = signals.filter(s => s.severity === 'critical').length

    db.prepare(`
      INSERT INTO daily_briefs (id, generated_at, summary, signal_count, critical_count, status)
      VALUES (?, ?, ?, ?, ?, 'published')
    `).run(briefId, new Date().toISOString(), summary, signals.length, criticalCount)

    const brief = db.prepare('SELECT * FROM daily_briefs WHERE id = ?').get(briefId)

    return NextResponse.json({ ok: true, brief })
  } catch (err) {
    console.error('Performance run error:', err)
    return NextResponse.json({ error: 'Failed to generate brief' }, { status: 500 })
  }
}
