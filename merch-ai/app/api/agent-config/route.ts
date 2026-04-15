import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ChatMessage { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  try {
    const { agent, history, currentInstructions } = await req.json() as {
      agent: string
      history: ChatMessage[]
      currentInstructions?: string
    }

    const latestRequest = [...history].reverse().find((m) => m.role === 'user')?.content ?? ''

    const instructionRes = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `Rewrite agent instructions for a ${agent}. Keep it under 120 words and operationally specific.`,
      messages: [{ role: 'user', content: `Current instructions: ${currentInstructions || 'None'}\nNew request: ${latestRequest}` }],
    })

    const instructions = instructionRes.content.find((c) => c.type === 'text' && 'text' in c)?.text ?? (currentInstructions || '')

    const replyRes = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 220,
      system: 'You are helping a merch operator configure an AI agent. Confirm what changed and what behavior to expect.',
      messages: [{ role: 'user', content: `Agent: ${agent}\nNew instructions: ${instructions}` }],
    })

    const reply = replyRes.content.find((c) => c.type === 'text' && 'text' in c)?.text ?? ''
    return NextResponse.json({ instructions, reply })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
