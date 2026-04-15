import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You are an AI agent designer for MerchAI, a retail merchandising platform. Your job is to help the user design a new monitoring agent based on their live product data.

When the user describes what they want to monitor, provide a helpful analysis of the relevant signals in their data. Then ALWAYS end your response with a structured agent template in this exact format:

<agent_template>
{
  "name": "Short Agent Name (3-4 words)",
  "focus": "One or two sentences describing exactly what this agent monitors and the specific threshold or condition that triggers an alert. Be precise.",
  "triggers": [
    "Specific trigger condition with threshold",
    "Second trigger or restock/action recommendation"
  ],
  "icon": "🚨",
  "color": "orange"
}
</agent_template>

Color must be exactly one of: blue, purple, pink, teal, orange, indigo
Icon must be exactly one of: 📊 🎯 💡 🔍 📈 🚨 ⚡ 🧩 🔧 💎 🏷 📦 🎁 🔄

Choose icon and color to match the agent purpose:
- Stockout / urgent alerts → 🚨, orange
- Pricing / margin → 📈, blue
- Bundling / cross-sell → 🎁, teal
- Seasonal / rotation → 🔄, indigo
- Risk / concentration → 🧩, purple
- Analytics / general → 📊, blue

Always include the <agent_template> block — update it as the conversation evolves with more precise details from the user.`

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    const stream = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 900,
      stream: true,
      system: SYSTEM,
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
          console.error('[create-agent] stream error:', err)
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
