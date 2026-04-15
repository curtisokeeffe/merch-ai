import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1024
): Promise<string> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })
  return (msg.content[0] as { text: string }).text
}

export { anthropic }
