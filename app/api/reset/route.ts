import { NextResponse } from 'next/server'
import { getDb, resetDemo } from '@/lib/db'
import { computeKPIs, formatKPIs } from '@/lib/kpis'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const db = getDb()
    resetDemo(db)
    const data = computeKPIs(db)
    return NextResponse.json({ ok: true, kpis: formatKPIs(data) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
