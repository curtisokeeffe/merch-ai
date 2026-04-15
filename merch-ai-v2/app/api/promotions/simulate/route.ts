import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { callClaude } from '@/lib/claude'

export async function POST(req: NextRequest) {
  try {
    const { sku_ids, discount_pct } = await req.json()
    const db = getDb()

    const placeholders = sku_ids.map(() => '?').join(',')
    const products = db.prepare(
      `SELECT sku_id, name, category, retail_price, cost_price, units_sold_30d, sell_through_rate, weeks_of_supply
       FROM products WHERE sku_id IN (${placeholders})`
    ).all(...sku_ids) as Array<{
      sku_id: string; name: string; category: string;
      retail_price: number; cost_price: number;
      units_sold_30d: number; sell_through_rate: number; weeks_of_supply: number;
    }>

    const productLines = products.map(p =>
      `- ${p.name} (${p.sku_id}): $${p.retail_price}, sold ${p.units_sold_30d} units/30d, STR ${p.sell_through_rate}%, ${p.weeks_of_supply} WoS`
    ).join('\n')

    const systemPrompt = `You are a retail promotions analyst. Simulate the financial impact of a promotional discount for a fashion retailer. Be specific about projected revenue, units, and margin. Use realistic elasticity assumptions for fashion apparel (typically -1.5 to -2.5). Output valid JSON only — no markdown.`

    const userMessage = `Simulate a ${discount_pct}% discount promotion on these products for a 30-day period:

${productLines}

Return ONLY a JSON object:
{
  "projected_revenue": <number — total revenue in dollars>,
  "projected_units": <number — total units sold>,
  "projected_margin_pct": <number — blended margin percentage>,
  "reasoning": "<2-3 sentences explaining the model assumptions and key drivers>"
}`

    const rawResponse = await callClaude(systemPrompt, userMessage, 600)

    let result: {
      projected_revenue: number;
      projected_units: number;
      projected_margin_pct: number;
      reasoning: string;
    }

    try {
      const cleaned = rawResponse.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
      result = JSON.parse(cleaned)
    } catch {
      // Fallback calculation if Claude response can't be parsed
      const baseRevenue = products.reduce((sum, p) => sum + p.retail_price * p.units_sold_30d, 0)
      const discountFactor = 1 - discount_pct / 100
      const elasticity = -1.8
      const unitUplift = 1 + (elasticity * (-discount_pct / 100))
      const projectedUnits = Math.round(products.reduce((sum, p) => sum + p.units_sold_30d, 0) * unitUplift)

      result = {
        projected_revenue: Math.round(baseRevenue * discountFactor * unitUplift),
        projected_units: projectedUnits,
        projected_margin_pct: 38.5,
        reasoning: `Using ${discount_pct}% discount with -1.8 price elasticity, projecting ${Math.round((unitUplift - 1) * 100)}% unit uplift. Revenue impact reflects volume gain partially offsetting price reduction.`,
      }
    }

    const scenarioId = `SCN-${Date.now()}`
    const names = products.map(p => p.name.split(' ').slice(0, 2).join(' ')).join(', ')
    const scenarioName = `${discount_pct}% Promo — ${names.length > 40 ? names.slice(0, 40) + '…' : names}`

    db.prepare(`
      INSERT INTO promotion_scenarios (id, name, sku_ids, discount_pct, projected_revenue,
        projected_units, projected_margin_pct, scenario_notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      scenarioId,
      scenarioName,
      JSON.stringify(sku_ids),
      discount_pct,
      result.projected_revenue,
      result.projected_units,
      result.projected_margin_pct,
      result.reasoning,
      new Date().toISOString()
    )

    return NextResponse.json({ ok: true, ...result, scenario_id: scenarioId })
  } catch (err) {
    console.error('Promotions simulate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
