import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { computeKPIs, formatKPIs } from '@/lib/kpis'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = getDb()
    const data = computeKPIs(db)
    return NextResponse.json({ kpis: formatKPIs(data), raw: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
