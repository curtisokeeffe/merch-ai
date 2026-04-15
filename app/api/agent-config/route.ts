import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const AGENT_ROLES: Record<string, string> = {
  'Markdown Agent': 'identifies markdown opportunities and slow-moving inventory that need price reductions',
  'Pricing Agent': 'optimises pricing strategy, margin recovery, and strategic price moves',
  'Assortment Agent': 'manages product mix, bundling strategies, and inventory optimisation',
  'Risk Agent': 'monitors portfolio concentration, risk factors, and diversification',
}

export async function POST(req: NextRequest) {
  try {
    const { agentName, messages, currentConfig } = await req.json()

    const role = AGENT_ROLES[agentName] || 'analyses retail merchandising data'

    const system = `You are the ${agentName} in a retail merchandising AI system. Your default role is to ${role}.

${currentConfig ? `Your current custom configuration: "${currentConfig}"` : 'You have no custom configuration yet — you run on default heuristics.'}

The merchant is configuring your behavior. When they give you instructions, acknowledge them clearly, confirm what you will focus on going forward, and ask one clarifying question if needed. Keep responses to 2-3 sentences. Be direct and professional.`

    const stream = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
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
          console.error('[agent-config] stream error:', err)
          controller.enqueue(encoder.encode('\n\n[Error: ' + String(err) + ']'))
          controller.enqueue(encoder.encode('\n\n[Claude is currently busy — please try again in a moment.]'))
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
