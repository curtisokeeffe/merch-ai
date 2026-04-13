import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import type { ActionCard } from '@/lib/insights'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ChatMessage { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  try {
    const { card, history, agentInstructions } = await req.json() as {
      card: ActionCard
      history: ChatMessage[]
      agentInstructions?: string
    }

    const system = [
      'You are an AI merch analyst discussing one signal card.',
      'Answer with concrete numbers, clear tradeoffs, and concise rationale.',
      agentInstructions ? `Custom agent instructions: ${agentInstructions}` : '',
    ].filter(Boolean).join(' ')

    const msg = [
      `Signal: ${card.title}`,
      `Impact: ${card.impact}`,
      `Context: ${card.context}`,
      `Data summary: ${card.dataSummary}`,
      '',
      'Conversation history:',
      ...history.map((m) => `${m.role.toUpperCase()}: ${m.content}`),
      '',
      'Reply as the assistant to the latest user message.',
    ].join('\n')

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 350,
      system,
      messages: [{ role: 'user', content: msg }],
    })

    const reply = response.content.find((c) => c.type === 'text' && 'text' in c)
    return NextResponse.json({ reply: reply?.text ?? '' })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
