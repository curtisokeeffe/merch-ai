import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { computeInsights } from '@/lib/insights'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = getDb()
    const result = computeInsights(db)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Insights error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
