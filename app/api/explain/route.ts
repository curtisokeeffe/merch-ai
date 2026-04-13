import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import type { ActionLogRow } from '@/lib/db'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { context, dataSummary } = await req.json()

    const db = getDb()
    const logs = db
      .prepare("SELECT * FROM action_log WHERE status = 'approved' ORDER BY approved_at ASC")
      .all() as ActionLogRow[]

    const actionContext = logs.length
      ? `PREVIOUSLY APPROVED ACTIONS:\n${logs.map((l) => `- ${l.agent_source}: ${l.title} (${l.approved_at?.split('T')[0]})`).join('\n')}`
      : ''

    const system = `You are a senior retail merchandising analyst. Given the following data and finding, explain in 3-4 sentences why this matters and what action the merchant should take. Be specific with numbers. Use natural merchandising language. No fluff, no hedging.${actionContext ? `\n\n${actionContext}\nAccount for these already-approved actions in your explanation.` : ''}`

    const stream = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      stream: true,
      system,
      messages: [{ role: 'user', content: `Finding: ${context}\n\nSupporting data: ${dataSummary}` }],
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
