import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import type { ActionCard, Mutation, Severity } from '@/lib/insights'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Infer severity from signal title/impact keywords
function inferSeverity(title: string, impact: string): Severity {
  const text = (title + ' ' + impact).toLowerCase()
  if (text.match(/stockout|critical|urgent|immediate|0 week|under 1 week|days? (of|until)|emergency/)) return 'red'
  if (text.match(/risk|watch|declining|excess|overstock|compres|gap|miss/)) return 'amber'
  return 'green'
}

// Build fallback mutations if Claude omits them
function buildFallbackMutations(affectedSkus: string[], agentConfig: string): Mutation[] {
  const config = agentConfig.toLowerCase()
  return affectedSkus.flatMap((sku_id) => {
    if (config.includes('markdown') || config.includes('discount') || config.includes('price')) {
      return [
        { sku_id, field: 'retail_price', operation: 'multiply' as const, value: 0.9 },
        { sku_id, field: 'markdown_pct', operation: 'set' as const, value: 10 },
        { sku_id, field: 'status', operation: 'set' as const, value: 'on_markdown' },
      ]
    }
    if (config.includes('stock') || config.includes('reorder') || config.includes('supply')) {
      return [
        { sku_id, field: 'status', operation: 'set' as const, value: 'reorder_flag' },
      ]
    }
    if (config.includes('bundle') || config.includes('multi') || config.includes('cross')) {
      return [
        { sku_id, field: 'retail_price', operation: 'multiply' as const, value: 0.95 },
        { sku_id, field: 'markdown_pct', operation: 'set' as const, value: 5 },
        { sku_id, field: 'status', operation: 'set' as const, value: 'on_markdown' },
      ]
    }
    return [
      { sku_id, field: 'status', operation: 'set' as const, value: 'active' },
    ]
  })
}

export async function POST(req: NextRequest) {
  try {
    const { agentName, agentConfig, products } = await req.json()

    if (!agentName || !products?.length) {
      return new Response(JSON.stringify({ signals: [], error: 'Missing agent name or products' }), { status: 400 })
    }

    const productSummary = products
      .map((p: any) => ({
        sku_id: p.sku_id,
        name: p.name,
        category: p.category,
        price: p.retail_price,
        cost: p.cost_price,
        stock: p.current_stock,
        status: p.status,
        sell_through_pct: p.sell_through_rate,
        weeks_supply: p.weeks_of_supply,
        revenue: p.total_revenue,
        margin_pct: (((p.retail_price - p.cost_price) / p.retail_price) * 100).toFixed(1),
        avg_qty_per_tx: p.avg_qty_per_tx,
        inventory_value: p.inventory_value,
      }))

    const system = `You are "${agentName}", a retail merchandising AI agent.

Your configured focus: "${agentConfig}"

Analyze the product data provided and generate 3 to 5 signals (actionable recommendations) that match your focus.

CRITICAL: You MUST return ONLY a raw JSON object. No markdown, no code fences, no explanation text before or after. Start your response with { and end with }.

Required JSON structure:
{
  "signals": [
    {
      "id": "signal-1",
      "title": "Specific SKU ID and problem — be precise, include SKU ID and metric",
      "impact": "Quantified impact: units at risk, $ inventory, % margin gap, weeks supply",
      "context": "2-3 sentences explaining the root cause and why action is needed now",
      "severity": "red|amber|green",
      "mutations": [
        {
          "sku_id": "EXACT-SKU-ID-FROM-DATA",
          "field": "retail_price",
          "operation": "multiply",
          "value": 0.90
        },
        {
          "sku_id": "EXACT-SKU-ID-FROM-DATA",
          "field": "markdown_pct",
          "operation": "set",
          "value": 10
        },
        {
          "sku_id": "EXACT-SKU-ID-FROM-DATA",
          "field": "status",
          "operation": "set",
          "value": "on_markdown"
        }
      ],
      "affectedSkus": ["EXACT-SKU-ID-FROM-DATA"]
    }
  ]
}

Rules for mutations:
- Every signal MUST have at least 1 mutation — never leave mutations as an empty array
- Use only SKU IDs that appear in the product data
- field options: retail_price, markdown_pct, status
- operation options: multiply (use for price ratios like 0.85), set (use for exact values), add (use for delta adjustments)
- For price markdowns: multiply retail_price by 0.75–0.95, set markdown_pct to 5–25, set status to "on_markdown"
- For price increases: multiply retail_price by 1.05–1.15, set status to "active"
- For reorder alerts: set status to "reorder_flag"
- For loyalty pricing: multiply retail_price by 0.90–0.95, set status to "loyalty-priced"

Rules for severity:
- red: Immediate action required (stockout risk, critical margin loss, revenue at serious risk)
- amber: Action within a week (excess inventory, pricing gap, watch-list items)
- green: Opportunity to capture (bundle, loyalty, proactive optimisation)

Include mutations that match "${agentName}"'s configured focus. If the agent is about stockouts, set status to reorder_flag. If about markdowns, apply price reductions. If about bundles, apply bundle discounts.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      system,
      messages: [
        {
          role: 'user',
          content: `Here is the live product catalog to analyze:\n\n${JSON.stringify(productSummary, null, 2)}\n\nGenerate signals matching: "${agentConfig}"`
        }
      ]
    })

    const fullResponse = message.content[0].type === 'text' ? message.content[0].text : ''

    let signals: ActionCard[] = []
    try {
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        signals = (parsed.signals || []).map((sig: any, idx: number) => {
          const mutations: Mutation[] = sig.mutations?.length
            ? sig.mutations
            : buildFallbackMutations(sig.affectedSkus || [], agentConfig)

          const affectedSkus: string[] = sig.affectedSkus?.length
            ? sig.affectedSkus
            : [...new Set(mutations.map((m: Mutation) => m.sku_id))]

          const severity: Severity = ['red', 'amber', 'green'].includes(sig.severity)
            ? sig.severity
            : inferSeverity(sig.title || '', sig.impact || '')

          return {
            id: `${agentName.toLowerCase().replace(/\s+/g, '-')}-${idx}-${Date.now()}`,
            severity,
            title: sig.title || 'Unnamed signal',
            impact: sig.impact || 'Impact not specified',
            context: sig.context || '',
            dataSummary: '',
            mutations,
            affectedSkus,
            agentSource: agentName,
          } satisfies ActionCard
        })
      }
    } catch (parseErr) {
      console.error('[generate-agent-signals] JSON parse error:', parseErr)
      console.error('[generate-agent-signals] Raw response:', fullResponse)
    }

    return new Response(JSON.stringify({ signals }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('[generate-agent-signals] error:', err)
    return new Response(JSON.stringify({ signals: [], error: String(err) }), { status: 500 })
  }
}
