'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActionCard, Severity } from '@/lib/insights'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KPIEntry { key: string; label: string; value: string; raw: number }

interface ChangeEntry {
  actionId: string
  agentSource: string
  title: string
  status: string
  approvedAt: string | null
  mutations: { sku_id: string; field: string; before: unknown; after: unknown }[]
  affectedSkus: string[]
}

interface ProductRow {
  sku_id: string
  name: string
  category: string
  retail_price: number
  cost_price: number
  markdown_pct: number
  status: string
  units_sold: number
  sell_through_rate: number
  weeks_of_supply: number
  inventory_value: number
  current_stock: number
}

type CardStatus = 'pending' | 'approved' | 'dismissed'
type Message = { role: 'user' | 'assistant'; content: string }

// ─── Constants ─────────────────────────────────────────────────────────────────

const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

const SEV_COLOR: Record<Severity, string> = { red: '#EF4444', amber: '#F59E0B', green: '#22C55E' }
const SEV_LABEL: Record<Severity, string> = { red: 'Critical', amber: 'Watch', green: 'Signal' }

const AGENT_DEFS = [
  { name: 'Markdown Agent',   color: '#EF4444', light: '#FEF2F2', border: '#FCA5A5' },
  { name: 'Pricing Agent',    color: '#F59E0B', light: '#FFFBEB', border: '#FCD34D' },
  { name: 'Assortment Agent', color: '#22C55E', light: '#F0FDF4', border: '#86EFAC' },
  { name: 'Risk Agent',       color: '#8B5CF6', light: '#F5F3FF', border: '#C4B5FD' },
]

function agentDef(name: string) {
  return AGENT_DEFS.find((a) => a.name === name) ?? AGENT_DEFS[1]
}

// ─── Animated number hook ───────────────────────────────────────────────────────

function useAnimatedNumber(target: number, duration = 900) {
  const [displayed, setDisplayed] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const from = fromRef.current
    if (from === target) return
    const start = performance.now()
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayed(from + (target - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else { fromRef.current = target; setDisplayed(target) }
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return displayed
}

// ─── AnimatedKPI ────────────────────────────────────────────────────────────────

function AnimatedKPI({ entry }: { entry: KPIEntry }) {
  const animated = useAnimatedNumber(entry.raw)

  function format(n: number): string {
    if (entry.key === 'inventoryValue' || entry.key === 'historicalRevenue')
      return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    if (entry.key === 'avgMarginPct' || entry.key === 'avgSellThrough')
      return `${n.toFixed(1)}%`
    return Math.round(n).toString()
  }

  return (
    <div style={{
      background: 'white', border: '1px solid #E2E8F0', borderRadius: 8,
      padding: '10px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
        {entry.label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: '#F59E0B', lineHeight: 1 }}>
        {format(animated)}
      </div>
    </div>
  )
}

// ─── SignalCard ─────────────────────────────────────────────────────────────────

interface SignalCardProps {
  card: ActionCard
  status: CardStatus
  isApproving: boolean
  chatOpen: boolean
  chatMessages: Message[]
  chatInput: string
  chatStreaming: boolean
  onApprove: (c: ActionCard) => void
  onDismiss: (c: ActionCard) => void
  onAskWhy: (c: ActionCard) => void
  onChatInputChange: (v: string) => void
  onChatSend: (text: string) => void
}

function SignalCard({
  card, status, isApproving, chatOpen, chatMessages, chatInput, chatStreaming,
  onApprove, onDismiss, onAskWhy, onChatInputChange, onChatSend,
}: SignalCardProps) {
  const isDone = status !== 'pending'
  const agent = agentDef(card.agentSource)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  return (
    <div style={{
      background: 'white',
      border: `1px solid ${status === 'approved' ? '#86EFAC' : status === 'dismissed' ? '#E2E8F0' : chatOpen ? agent.border : '#E2E8F0'}`,
      borderRadius: 10,
      overflow: 'hidden',
      opacity: status === 'dismissed' ? 0.5 : 1,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      transition: 'border-color 0.15s, opacity 0.15s',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ padding: '16px' }}>
        {/* Agent badge + status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: agent.color,
            background: agent.light, border: `1px solid ${agent.border}`,
            padding: '2px 8px', borderRadius: 4,
          }}>
            {card.agentSource}
          </span>
          {status === 'approved' && (
            <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 600 }}>✓ Approved</span>
          )}
          {status === 'dismissed' && (
            <span style={{ fontSize: 12, color: '#CBD5E1', fontWeight: 500 }}>Dismissed</span>
          )}
          {status === 'pending' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: SEV_COLOR[card.severity],
                boxShadow: `0 0 6px ${SEV_COLOR[card.severity]}66`,
              }} />
              <span style={{ fontSize: 12, color: '#94A3B8' }}>{SEV_LABEL[card.severity]}</span>
            </div>
          )}
        </div>

        {/* Title */}
        <h3 style={{
          fontSize: 15, fontWeight: 600,
          color: isDone ? '#94A3B8' : '#1E293B',
          lineHeight: 1.4, marginBottom: 8,
        }}>
          {card.title}
        </h3>

        {/* Impact */}
        <p style={{ fontSize: 13, color: '#64748B', marginBottom: 12, lineHeight: 1.5 }}>
          {card.impact}
        </p>

        {/* Mutations pill */}
        {card.mutations.length > 0 && !isDone && (
          <div style={{ marginBottom: 12 }}>
            <span style={{
              fontFamily: MONO, fontSize: 11, color: '#94A3B8',
              background: '#F8FAFC', border: '1px solid #E2E8F0',
              borderRadius: 4, padding: '3px 8px',
            }}>
              {card.mutations.length} mutation{card.mutations.length !== 1 ? 's' : ''} · {card.affectedSkus.length} SKU{card.affectedSkus.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Actions */}
        {!isDone && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => onApprove(card)}
              disabled={isApproving}
              style={{
                background: isApproving ? '#F8FAFC' : '#F0FDF4',
                border: `1px solid ${isApproving ? '#E2E8F0' : '#86EFAC'}`,
                borderRadius: 6, padding: '7px 14px',
                fontSize: 13, fontWeight: 600,
                color: isApproving ? '#CBD5E1' : '#22C55E',
                cursor: isApproving ? 'not-allowed' : 'pointer',
                fontFamily: SANS, transition: 'all 0.15s',
              }}
            >
              {isApproving ? 'Applying…' : '✓ Approve'}
            </button>
            <button
              onClick={() => onDismiss(card)}
              style={{
                background: 'transparent', border: '1px solid #E2E8F0',
                borderRadius: 6, padding: '7px 14px',
                fontSize: 13, color: '#94A3B8',
                cursor: 'pointer', fontFamily: SANS, transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#FCA5A5'; (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8' }}
            >
              Dismiss
            </button>
            <button
              onClick={() => onAskWhy(card)}
              style={{
                background: chatOpen ? agent.light : 'transparent',
                border: `1px solid ${chatOpen ? agent.border : '#E2E8F0'}`,
                borderRadius: 6, padding: '7px 14px',
                fontSize: 13, fontWeight: chatOpen ? 600 : 400,
                color: chatOpen ? agent.color : '#94A3B8',
                cursor: 'pointer', fontFamily: SANS,
                marginLeft: 'auto', transition: 'all 0.15s',
              }}
            >
              {chatOpen ? 'Close' : 'Ask Why →'}
            </button>
          </div>
        )}
      </div>

      {/* Inline chat thread */}
      {chatOpen && (
        <div style={{ borderTop: `1px solid ${agent.border}`, background: agent.light, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', maxHeight: 240, overflowY: 'auto' }}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 10, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '90%',
                  background: msg.role === 'user' ? agent.color : 'white',
                  borderRadius: 8, padding: '8px 12px',
                  fontSize: 13, lineHeight: 1.5,
                  color: msg.role === 'user' ? 'white' : '#1E293B',
                  border: msg.role === 'assistant' ? '1px solid #E2E8F0' : 'none',
                }}>
                  {msg.content || (chatStreaming && i === chatMessages.length - 1
                    ? <span style={{ color: agent.color }}>▍</span>
                    : null
                  )}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
          <div style={{ padding: '10px 16px', borderTop: `1px solid ${agent.border}`, display: 'flex', gap: 8 }}>
            <input
              value={chatInput}
              onChange={(e) => onChatInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !chatStreaming && chatInput.trim()) {
                  e.preventDefault()
                  onChatSend(chatInput)
                }
              }}
              placeholder="Follow up…"
              disabled={chatStreaming}
              style={{
                flex: 1, border: '1px solid #E2E8F0', borderRadius: 6,
                padding: '7px 12px', fontSize: 13, color: '#1E293B',
                background: chatStreaming ? '#F8FAFC' : 'white',
                fontFamily: SANS,
              }}
            />
            <button
              onClick={() => onChatSend(chatInput)}
              disabled={chatStreaming || !chatInput.trim()}
              style={{
                background: chatStreaming || !chatInput.trim() ? '#F1F5F9' : agent.color,
                border: 'none', borderRadius: 6, padding: '7px 14px',
                fontSize: 14, fontWeight: 600,
                color: chatStreaming || !chatInput.trim() ? '#94A3B8' : 'white',
                cursor: chatStreaming || !chatInput.trim() ? 'not-allowed' : 'pointer',
                fontFamily: SANS, transition: 'all 0.15s',
              }}
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ConfigureDrawer ────────────────────────────────────────────────────────────

interface ConfigureDrawerProps {
  agentName: string
  chat: Message[]
  input: string
  streaming: boolean
  currentConfig?: string
  onClose: () => void
  onInputChange: (v: string) => void
  onSend: (text: string) => void
}

function ConfigureDrawer({ agentName, chat, input, streaming, currentConfig, onClose, onInputChange, onSend }: ConfigureDrawerProps) {
  const agent = agentDef(agentName)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

  return (
    <div style={{
      width: 340, borderLeft: '1px solid #E2E8F0', background: 'white',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid #E2E8F0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: agent.color, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{agentName}</span>
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>Configure agent behavior</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', fontSize: 20, color: '#94A3B8', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {chat.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: agent.light, border: `2px solid ${agent.border}`,
              margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>
              ⚙
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>{agentName}</div>
            <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
              Tell me how to focus my analysis.<br />
              {currentConfig
                ? <span style={{ color: '#64748B' }}>Current: "{currentConfig}"</span>
                : 'I currently run on default heuristics.'}
            </div>
          </div>
        ) : (
          chat.map((msg, i) => (
            <div key={i} style={{
              marginBottom: 12,
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '85%',
                background: msg.role === 'user' ? agent.light : '#F8FAFC',
                border: `1px solid ${msg.role === 'user' ? agent.border : '#E2E8F0'}`,
                borderRadius: 8, padding: '8px 12px',
                fontSize: 13, color: '#1E293B', lineHeight: 1.5,
              }}>
                {msg.content || (streaming && i === chat.length - 1
                  ? <span style={{ color: agent.color }}>▍</span>
                  : null
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !streaming && input.trim()) {
              e.preventDefault()
              onSend(input)
            }
          }}
          placeholder={`Instruct ${agentName}…`}
          disabled={streaming}
          style={{
            flex: 1, border: '1px solid #E2E8F0', borderRadius: 6,
            padding: '8px 12px', fontSize: 13, color: '#1E293B',
            background: streaming ? '#F8FAFC' : 'white',
            fontFamily: SANS,
          }}
        />
        <button
          onClick={() => onSend(input)}
          disabled={streaming || !input.trim()}
          style={{
            background: streaming || !input.trim() ? '#F1F5F9' : agent.color,
            border: 'none', borderRadius: 6, padding: '8px 14px',
            fontSize: 13, fontWeight: 600,
            color: streaming || !input.trim() ? '#94A3B8' : 'white',
            cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer',
            fontFamily: SANS, transition: 'all 0.15s',
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function Home() {
  // Core data
  const [kpis, setKpis] = useState<KPIEntry[]>([])
  const [cards, setCards] = useState<ActionCard[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  // Card actions
  const [cardStatus, setCardStatus] = useState<Record<string, CardStatus>>({})
  const [approving, setApproving] = useState<Record<string, boolean>>({})

  // Tabs
  const [activeTab, setActiveTab] = useState<'signals' | 'changes' | 'data-peek'>('signals')
  const [changes, setChanges] = useState<ChangeEntry[]>([])
  const [changesLoading, setChangesLoading] = useState(false)

  // Card inline chat
  const [cardChatOpen, setCardChatOpen] = useState<string | null>(null)
  const [cardChats, setCardChats] = useState<Record<string, Message[]>>({})
  const [cardChatInput, setCardChatInput] = useState<Record<string, string>>({})
  const [cardChatStreaming, setCardChatStreaming] = useState<Record<string, boolean>>({})

  // Configure drawer
  const [configureAgent, setConfigureAgent] = useState<string | null>(null)
  const [agentConfigs, setAgentConfigs] = useState<Record<string, string>>({})
  const [configChat, setConfigChat] = useState<Message[]>([])
  const [configInput, setConfigInput] = useState('')
  const [configStreaming, setConfigStreaming] = useState(false)

  // Bottom chat
  const [chatHistory, setChatHistory] = useState<Message[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // Data peek
  const [dbProducts, setDbProducts] = useState<ProductRow[] | null>(null)
  const [dbChangedSkus, setDbChangedSkus] = useState<string[]>([])
  const [dbLoading, setDbLoading] = useState(false)

  // ── Initial load ──
  useEffect(() => {
    Promise.all([
      fetch('/api/kpis').then((r) => r.json()),
      fetch('/api/insights').then((r) => r.json()),
    ])
      .then(([kpiData, insightData]) => {
        if (kpiData.kpis) setKpis(kpiData.kpis)
        if (insightData.cards) setCards(insightData.cards)
        setLoading(false)
      })
      .catch((e) => { setError(String(e)); setLoading(false) })
  }, [])

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  // ── Data loaders ──
  const loadChanges = useCallback(async () => {
    setChangesLoading(true)
    const data = await fetch('/api/changes').then((r) => r.json())
    if (data.changes) setChanges(data.changes)
    setChangesLoading(false)
  }, [])

  const loadDbPeek = useCallback(async () => {
    setDbLoading(true)
    const data = await fetch('/api/db-peek').then((r) => r.json())
    if (data.products) setDbProducts(data.products)
    if (data.changedSkus) setDbChangedSkus(data.changedSkus)
    setDbLoading(false)
  }, [])

  // ── Card actions ──
  async function handleApprove(card: ActionCard) {
    setApproving((p) => ({ ...p, [card.id]: true }))
    try {
      const res = await fetch('/api/actions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card }),
      })
      const data = await res.json()
      if (data.kpis) setKpis(data.kpis)
      setCardStatus((p) => ({ ...p, [card.id]: 'approved' }))
    } finally {
      setApproving((p) => ({ ...p, [card.id]: false }))
    }
  }

  async function handleDismiss(card: ActionCard) {
    await fetch('/api/actions/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card }),
    })
    setCardStatus((p) => ({ ...p, [card.id]: 'dismissed' }))
  }

  // ── Card chat ──
  async function sendCardChat(cardId: string, card: ActionCard, userText: string) {
    const prev = cardChats[cardId] || []
    const newMessages: Message[] = [...prev, { role: 'user', content: userText }]
    setCardChats((p) => ({ ...p, [cardId]: [...newMessages, { role: 'assistant', content: '' }] }))
    setCardChatStreaming((p) => ({ ...p, [cardId]: true }))
    setCardChatInput((p) => ({ ...p, [cardId]: '' }))

    const res = await fetch('/api/card-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card, messages: newMessages, agentConfig: agentConfigs[card.agentSource] }),
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let text = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      setCardChats((p) => {
        const msgs = [...(p[cardId] || [])]
        msgs[msgs.length - 1] = { role: 'assistant', content: text }
        return { ...p, [cardId]: msgs }
      })
    }
    setCardChatStreaming((p) => ({ ...p, [cardId]: false }))
  }

  async function handleAskWhy(card: ActionCard) {
    if (cardChatOpen === card.id) {
      setCardChatOpen(null)
      return
    }
    setCardChatOpen(card.id)
    if (!cardChats[card.id]?.length) {
      await sendCardChat(card.id, card, 'Why did you flag this?')
    }
  }

  // ── Configure chat ──
  async function sendConfigChat(text: string) {
    if (!configureAgent || !text.trim()) return
    const newMessages: Message[] = [...configChat, { role: 'user', content: text }]
    setConfigChat([...newMessages, { role: 'assistant', content: '' }])
    setConfigInput('')
    setConfigStreaming(true)

    const res = await fetch('/api/agent-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName: configureAgent, messages: newMessages, currentConfig: agentConfigs[configureAgent] }),
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let responseText = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      responseText += decoder.decode(value, { stream: true })
      setConfigChat((p) => {
        const msgs = [...p]
        msgs[msgs.length - 1] = { role: 'assistant', content: responseText }
        return msgs
      })
    }
    // Store last user instruction as the active config
    setAgentConfigs((p) => ({ ...p, [configureAgent]: text }))
    setConfigStreaming(false)
  }

  // ── Bottom chat ──
  async function sendChat(text: string) {
    if (!text.trim() || chatStreaming) return
    const newMessages: Message[] = [...chatHistory, { role: 'user', content: text }]
    setChatHistory([...newMessages, { role: 'assistant', content: '' }])
    setChatInput('')
    setChatStreaming(true)

    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: newMessages }),
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let responseText = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      responseText += decoder.decode(value, { stream: true })
      setChatHistory((p) => {
        const msgs = [...p]
        msgs[msgs.length - 1] = { role: 'assistant', content: responseText }
        return msgs
      })
    }
    setChatStreaming(false)
  }

  // ── Reset ──
  async function handleReset() {
    setResetting(true)
    const res = await fetch('/api/reset', { method: 'POST' })
    const data = await res.json()
    if (data.kpis) setKpis(data.kpis)
    setCardStatus({})
    setChanges([])
    setCardChats({})
    setCardChatOpen(null)
    setChatHistory([])
    setConfigureAgent(null)
    setConfigChat([])
    setDbProducts(null)
    const ins = await fetch('/api/insights').then((r) => r.json())
    if (ins.cards) setCards(ins.cards)
    setResetting(false)
  }

  // ── Agent sidebar stats ──
  function agentStats(name: string) {
    const agentCards = (cards ?? []).filter((c) => c.agentSource === name)
    const pending = agentCards.filter((c) => (cardStatus[c.id] || 'pending') === 'pending').length
    const approved = agentCards.filter((c) => cardStatus[c.id] === 'approved').length
    const dismissed = agentCards.filter((c) => cardStatus[c.id] === 'dismissed').length
    const value = agentCards
      .map((c) => { const m = c.impact.match(/\$([\d,]+)/); return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0 })
      .reduce((a, b) => a + b, 0)
    return { pending, approved, dismissed, value }
  }

  // ── Loading / error ──
  if (loading) {
    return (
      <div style={{ background: '#F8FAFC', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#F59E0B', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Initialising database…</div>
          <div style={{ color: '#94A3B8', fontSize: 13 }}>Seeding from CSV on first run…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ background: '#F8FAFC', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: SANS }}>
        <div style={{ background: 'white', border: '1px solid #FCA5A5', borderRadius: 10, padding: 24, maxWidth: 600 }}>
          <div style={{ color: '#EF4444', fontWeight: 600, marginBottom: 8 }}>Load Error</div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: '#64748B' }}>{error}</div>
        </div>
      </div>
    )
  }

  const now = new Date()

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F8FAFC', fontFamily: SANS, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <header style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '12px 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.5px' }}>MerchAI</span>
            <span style={{
              background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 4,
              padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#F59E0B',
              fontFamily: MONO, letterSpacing: '1px',
            }}>
              LIVE
            </span>
            <span style={{ fontSize: 13, color: '#94A3B8' }}>
              {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <button
            onClick={handleReset}
            disabled={resetting}
            style={{
              background: 'transparent', border: '1px solid #E2E8F0',
              borderRadius: 6, padding: '6px 14px',
              fontSize: 13, color: resetting ? '#CBD5E1' : '#64748B',
              cursor: resetting ? 'not-allowed' : 'pointer',
              fontFamily: SANS, transition: 'all 0.15s',
            }}
          >
            {resetting ? 'Resetting…' : '↺ Reset Demo'}
          </button>
        </div>
        {/* KPI bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {kpis.map((k) => <AnimatedKPI key={k.key} entry={k} />)}
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width: 280, background: 'white', borderRight: '1px solid #E2E8F0',
          padding: '16px 14px', overflowY: 'auto', flexShrink: 0,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#94A3B8',
            textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14,
          }}>
            Agents
          </div>
          {AGENT_DEFS.map((agent) => {
            const stats = agentStats(agent.name)
            const hasConfig = !!agentConfigs[agent.name]
            const isOpen = configureAgent === agent.name
            return (
              <div key={agent.name} style={{
                background: 'white',
                border: `1px solid ${isOpen ? agent.border : '#E2E8F0'}`,
                borderRadius: 10, padding: '12px',
                marginBottom: 10, transition: 'border-color 0.15s',
              }}>
                {/* Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: agent.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{agent.name}</span>
                </div>
                {/* Custom config preview */}
                {hasConfig && (
                  <div style={{
                    fontSize: 11, color: '#64748B', marginBottom: 10,
                    fontStyle: 'italic', lineHeight: 1.4,
                    background: agent.light, border: `1px solid ${agent.border}`,
                    borderRadius: 6, padding: '6px 8px',
                  }}>
                    "{agentConfigs[agent.name].length > 70
                      ? agentConfigs[agent.name].slice(0, 70) + '…'
                      : agentConfigs[agent.name]}"
                  </div>
                )}
                {/* Signal breakdown */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {[
                    { label: 'pending', value: stats.pending, color: '#1E293B' },
                    { label: 'approved', value: stats.approved, color: '#22C55E' },
                    { label: 'dismissed', value: stats.dismissed, color: '#CBD5E1' },
                  ].map((s) => (
                    <div key={s.label} style={{ flex: 1, textAlign: 'center', background: '#F8FAFC', borderRadius: 6, padding: '6px 0' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {/* Value estimate */}
                {stats.value > 0 && (
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>
                    Est. value: <strong style={{ color: '#F59E0B' }}>${stats.value.toLocaleString()}</strong>
                  </div>
                )}
                {/* Configure button */}
                <button
                  onClick={() => {
                    if (isOpen) {
                      setConfigureAgent(null)
                    } else {
                      setConfigureAgent(agent.name)
                      setConfigChat([])
                      setConfigInput('')
                    }
                  }}
                  style={{
                    width: '100%',
                    background: isOpen ? agent.light : '#F8FAFC',
                    border: `1px solid ${isOpen ? agent.border : '#E2E8F0'}`,
                    borderRadius: 6, padding: '7px 0',
                    fontSize: 12, fontWeight: 600,
                    color: isOpen ? agent.color : '#64748B',
                    cursor: 'pointer', fontFamily: SANS, transition: 'all 0.15s',
                  }}
                >
                  {isOpen ? '✕ Close Config' : '⚙ Configure'}
                </button>
              </div>
            )
          })}
        </aside>

        {/* ── Main content ── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: 18 }}>
            {([
              { key: 'signals' as const, label: `Signals (${cards?.length ?? 0})` },
              { key: 'changes' as const, label: `Changes (${changes.length})` },
              { key: 'data-peek' as const, label: 'Data Peek' },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key)
                  if (tab.key === 'changes') loadChanges()
                  if (tab.key === 'data-peek') loadDbPeek()
                }}
                style={{
                  background: 'transparent', border: 'none',
                  borderBottom: `2px solid ${activeTab === tab.key ? '#F59E0B' : 'transparent'}`,
                  padding: '8px 18px', fontSize: 13, fontWeight: 600,
                  color: activeTab === tab.key ? '#F59E0B' : '#94A3B8',
                  cursor: 'pointer', marginBottom: -1,
                  fontFamily: SANS, transition: 'color 0.15s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Signals tab ── */}
          {activeTab === 'signals' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              {cards?.map((card) => (
                <SignalCard
                  key={card.id}
                  card={card}
                  status={cardStatus[card.id] || 'pending'}
                  isApproving={approving[card.id] || false}
                  chatOpen={cardChatOpen === card.id}
                  chatMessages={cardChats[card.id] || []}
                  chatInput={cardChatInput[card.id] || ''}
                  chatStreaming={cardChatStreaming[card.id] || false}
                  onApprove={handleApprove}
                  onDismiss={handleDismiss}
                  onAskWhy={handleAskWhy}
                  onChatInputChange={(v) => setCardChatInput((p) => ({ ...p, [card.id]: v }))}
                  onChatSend={(text) => sendCardChat(card.id, card, text)}
                />
              ))}
            </div>
          )}

          {/* ── Changes tab ── */}
          {activeTab === 'changes' && (
            <div>
              {changesLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>Loading…</div>
              ) : changes.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, color: '#CBD5E1', marginBottom: 6 }}>No actions yet</div>
                  <div style={{ fontSize: 13, color: '#E2E8F0' }}>Approve a signal to see mutations here.</div>
                </div>
              ) : (
                <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
                  {changes.map((entry, ei) => {
                    const adef = agentDef(entry.agentSource)
                    return (
                      <div key={entry.actionId}>
                        {ei > 0 && <div style={{ height: 1, background: '#F1F5F9' }} />}
                        <div style={{ padding: '14px 18px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                fontSize: 11, fontWeight: 700, color: adef.color,
                                background: adef.light, border: `1px solid ${adef.border}`,
                                padding: '2px 7px', borderRadius: 4,
                              }}>
                                {entry.agentSource}
                              </span>
                              <span style={{ fontSize: 14, color: '#1E293B', fontWeight: 500 }}>{entry.title}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: MONO, fontSize: 11, color: '#94A3B8' }}>
                                {entry.approvedAt ? new Date(entry.approvedAt).toTimeString().slice(0, 8) : ''}
                              </span>
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                                background: entry.status === 'approved' ? '#F0FDF4' : '#FEF2F2',
                                color: entry.status === 'approved' ? '#22C55E' : '#EF4444',
                                border: `1px solid ${entry.status === 'approved' ? '#86EFAC' : '#FCA5A5'}`,
                              }}>
                                {entry.status}
                              </span>
                            </div>
                          </div>
                          {entry.mutations.map((m, mi) => (
                            <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, fontSize: 13, color: '#64748B' }}>
                              <span style={{ fontFamily: MONO, fontSize: 11, color: '#94A3B8', width: 80, flexShrink: 0 }}>{m.sku_id}</span>
                              <span>{m.field.replace(/_/g, ' ')}</span>
                              <span style={{ fontFamily: MONO }}>{typeof m.before === 'number' ? m.before.toFixed(2) : String(m.before)}</span>
                              <span style={{ color: '#CBD5E1' }}>→</span>
                              <span style={{ fontFamily: MONO, color: m.field.includes('price') ? '#F59E0B' : '#1E293B', fontWeight: 600 }}>
                                {typeof m.after === 'number' ? m.after.toFixed(2) : String(m.after)}
                              </span>
                              {typeof m.before === 'number' && typeof m.after === 'number' && m.field.includes('price') && (
                                <span style={{ fontFamily: MONO, fontSize: 11, color: m.after < m.before ? '#EF4444' : '#22C55E' }}>
                                  ({m.after < m.before ? '' : '+'}{(((m.after - m.before) / m.before) * 100).toFixed(1)}%)
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Data Peek tab ── */}
          {activeTab === 'data-peek' && (
            <div>
              {dbLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>Loading…</div>
              ) : !dbProducts ? (
                <div style={{ padding: 60, textAlign: 'center', color: '#CBD5E1', fontSize: 14 }}>No data loaded.</div>
              ) : (
                <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{
                    padding: '10px 16px', borderBottom: '1px solid #E2E8F0',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', fontFamily: MONO }}>live_products</span>
                    <span style={{ fontSize: 12, color: '#94A3B8' }}>{dbProducts.length} rows</span>
                    {dbChangedSkus.length > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#22C55E', fontWeight: 600 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#22C55E', display: 'inline-block' }} />
                        {dbChangedSkus.length} row{dbChangedSkus.length !== 1 ? 's' : ''} modified
                      </span>
                    )}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          {['SKU', 'Name', 'Category', 'Retail $', 'Cost $', 'Markdown %', 'Status', 'Units Sold', 'Sell-Through', 'WoS', 'Stock'].map((h) => (
                            <th key={h} style={{
                              padding: '8px 12px', textAlign: 'left',
                              fontSize: 11, fontWeight: 600, color: '#94A3B8',
                              textTransform: 'uppercase', letterSpacing: '0.5px',
                              borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap',
                            }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dbProducts.map((p, i) => {
                          const changed = dbChangedSkus.includes(p.sku_id)
                          return (
                            <tr key={p.sku_id} style={{ background: changed ? '#F0FDF4' : i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                              <td style={{ padding: '7px 12px', fontFamily: MONO, fontSize: 11, color: '#64748B', whiteSpace: 'nowrap' }}>{p.sku_id}</td>
                              <td style={{ padding: '7px 12px', color: '#1E293B', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                              <td style={{ padding: '7px 12px', color: '#64748B', whiteSpace: 'nowrap' }}>{p.category}</td>
                              <td style={{ padding: '7px 12px', fontFamily: MONO, color: '#F59E0B', fontWeight: 600, whiteSpace: 'nowrap' }}>${p.retail_price.toFixed(2)}</td>
                              <td style={{ padding: '7px 12px', fontFamily: MONO, color: '#94A3B8', whiteSpace: 'nowrap' }}>${p.cost_price.toFixed(2)}</td>
                              <td style={{ padding: '7px 12px', fontFamily: MONO, color: p.markdown_pct > 0 ? '#EF4444' : '#94A3B8', whiteSpace: 'nowrap' }}>
                                {p.markdown_pct > 0 ? `${p.markdown_pct}%` : '—'}
                              </td>
                              <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                                <span style={{
                                  fontSize: 11, padding: '2px 7px', borderRadius: 4,
                                  background: p.status === 'on_markdown' ? '#FEF2F2' : p.status === 'loyalty-priced' ? '#F5F3FF' : '#F0FDF4',
                                  color: p.status === 'on_markdown' ? '#EF4444' : p.status === 'loyalty-priced' ? '#8B5CF6' : '#22C55E',
                                }}>
                                  {p.status}
                                </span>
                              </td>
                              <td style={{ padding: '7px 12px', fontFamily: MONO, color: '#64748B', whiteSpace: 'nowrap' }}>{p.units_sold}</td>
                              <td style={{ padding: '7px 12px', fontFamily: MONO, whiteSpace: 'nowrap', color: p.sell_through_rate > 75 ? '#22C55E' : p.sell_through_rate < 30 ? '#EF4444' : '#64748B' }}>
                                {p.sell_through_rate.toFixed(0)}%
                              </td>
                              <td style={{ padding: '7px 12px', fontFamily: MONO, whiteSpace: 'nowrap', color: p.weeks_of_supply > 16 ? '#EF4444' : '#64748B' }}>
                                {p.weeks_of_supply.toFixed(1)}
                              </td>
                              <td style={{ padding: '7px 12px', fontFamily: MONO, color: '#64748B', whiteSpace: 'nowrap' }}>{p.current_stock}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* ── Configure drawer ── */}
        {configureAgent && (
          <ConfigureDrawer
            agentName={configureAgent}
            chat={configChat}
            input={configInput}
            streaming={configStreaming}
            currentConfig={agentConfigs[configureAgent]}
            onClose={() => setConfigureAgent(null)}
            onInputChange={setConfigInput}
            onSend={sendConfigChat}
          />
        )}
      </div>

      {/* ── Bottom chat bar ── */}
      <div style={{ borderTop: '1px solid #E2E8F0', background: 'white', flexShrink: 0 }}>
        {/* History */}
        {chatHistory.length > 0 && (
          <div style={{ maxHeight: 200, overflowY: 'auto', padding: '12px 24px 0', borderBottom: '1px solid #F1F5F9' }}>
            {chatHistory.map((msg, i) => (
              <div key={i} style={{ marginBottom: 10, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '70%',
                  background: msg.role === 'user' ? '#1E293B' : '#F8FAFC',
                  border: msg.role === 'assistant' ? '1px solid #E2E8F0' : 'none',
                  borderRadius: 8, padding: '8px 14px',
                  fontSize: 14, lineHeight: 1.5,
                  color: msg.role === 'user' ? 'white' : '#1E293B',
                }}>
                  {msg.content || (chatStreaming && i === chatHistory.length - 1
                    ? <span style={{ color: '#F59E0B' }}>▍</span>
                    : null
                  )}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
        )}
        {/* Input row */}
        <div style={{ padding: '12px 24px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#94A3B8', flexShrink: 0, fontWeight: 500 }}>Ask your data:</span>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !chatStreaming && chatInput.trim()) {
                e.preventDefault()
                sendChat(chatInput)
              }
            }}
            placeholder="e.g. Which SKUs should I prioritise for Q1 promotions?"
            disabled={chatStreaming}
            style={{
              flex: 1, border: '1px solid #E2E8F0', borderRadius: 8,
              padding: '9px 14px', fontSize: 14, color: '#1E293B',
              background: chatStreaming ? '#F8FAFC' : 'white',
              fontFamily: SANS,
            }}
          />
          <button
            onClick={() => sendChat(chatInput)}
            disabled={chatStreaming || !chatInput.trim()}
            style={{
              background: chatStreaming || !chatInput.trim() ? '#F1F5F9' : '#F59E0B',
              border: 'none', borderRadius: 8, padding: '9px 20px',
              fontSize: 14, fontWeight: 600,
              color: chatStreaming || !chatInput.trim() ? '#94A3B8' : 'white',
              cursor: chatStreaming || !chatInput.trim() ? 'not-allowed' : 'pointer',
              fontFamily: SANS, whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}
          >
            {chatStreaming ? 'Thinking…' : 'Ask →'}
          </button>
          {chatHistory.length > 0 && (
            <button
              onClick={() => setChatHistory([])}
              style={{
                background: 'transparent', border: '1px solid #E2E8F0',
                borderRadius: 8, padding: '9px 12px',
                fontSize: 13, color: '#94A3B8',
                cursor: 'pointer', fontFamily: SANS, transition: 'all 0.15s',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
