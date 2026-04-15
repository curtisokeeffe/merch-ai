import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { card, messages, agentConfig } = await req.json()

    const system = `You are the ${card.agentSource} in a retail merchandising AI system.

You flagged a signal titled "${card.title}" with this context:
${card.context}

Data: ${card.dataSummary}
Impact: ${card.impact}
Affected SKUs: ${(card.affectedSkus ?? []).join(', ')}
${agentConfig ? `\nYour current configuration: ${agentConfig}` : ''}

Answer the merchant's questions about why you flagged this, what the data shows, and what they should consider. Be specific and concise — 2-4 sentences max per reply.`

    const stream = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 400,
      stream: true,
      system,
      messages,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
        } catch (err) {
          console.error('[card-chat] stream error:', err)
          controller.enqueue(encoder.encode('\n\n[Error: ' + String(err) + ']'))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch (err) {
    return new Response(String(err), { status: 500 })
  }
}
