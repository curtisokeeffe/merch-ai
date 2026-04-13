import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import type { ActionLogRow, ProductRow } from '@/lib/db'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json()

    const db = getDb()
    const products = db.prepare('SELECT * FROM live_products').all() as ProductRow[]
    const logs = db
      .prepare("SELECT * FROM action_log WHERE status = 'approved' ORDER BY approved_at ASC")
      .all() as ActionLogRow[]

    const productSummary = products
      .map(
        (p) =>
          `${p.sku_id} | ${p.name} | ${p.category} | price: $${p.retail_price} | stock: ${p.current_stock} | sell-through: ${p.sell_through_rate.toFixed(0)}% | inv value: $${p.inventory_value.toFixed(0)} | status: ${p.status}`
      )
      .join('\n')

    const actionSummary = logs.length
      ? `\nAPPROVED ACTIONS TAKEN:\n${logs.map((l) => `- ${l.agent_source}: ${l.title}`).join('\n')}`
      : ''

    const system = `You are a retail analytics assistant with direct access to the merchant's live product database. Answer concisely using specific numbers from the data. Respond in 2-5 sentences. Reference SKU IDs when relevant.`

    const stream = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      stream: true,
      system,
      messages: [
        {
          role: 'user',
          content: `LIVE PRODUCT DATA:\n${productSummary}${actionSummary}\n\nQuestion: ${question}`,
        },
      ],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
        controller.close()
      },
    })

    return new Response(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch (err) {
    return new Response(String(err), { status: 500 })
  }
}
