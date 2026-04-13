'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActionCard, Severity } from '@/lib/insights'

// ─── Types ─────────────────────────────────────────────────────────────────────

type CardStatus = 'pending' | 'approved' | 'dismissed'
type Message = { role: 'user' | 'assistant'; content: string }

// ─── Constants ─────────────────────────────────────────────────────────────────

const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

const SEV_COLOR: Record<Severity, string> = { red: '#EF4444', amber: '#F59E0B', green: '#22C55E' }
const SEV_LABEL: Record<Severity, string> = { red: 'Critical', amber: 'Watch', green: 'Signal' }

const AGENT_DEFS = [
  { name: 'Markdown Agent',   color: '#EF4444', light: '#FEF2F2', border: '#FCA5A5', icon: '📉', desc: 'Identifies slow-movers and markdown opportunities across your catalog.' },
  { name: 'Pricing Agent',    color: '#F59E0B', light: '#FFFBEB', border: '#FCD34D', icon: '💰', desc: 'Optimises price tiers, margin recovery, and strategic pricing moves.' },
  { name: 'Assortment Agent', color: '#22C55E', light: '#F0FDF4', border: '#86EFAC', icon: '📦', desc: 'Manages product mix, bundling strategies, and inventory depth.' },
  { name: 'Risk Agent',       color: '#8B5CF6', light: '#F5F3FF', border: '#C4B5FD', icon: '🛡',  desc: 'Monitors portfolio concentration risk and diversification health.' },
]

function agentDef(name: string) { return AGENT_DEFS.find((a) => a.name === name) ?? AGENT_DEFS[1] }

function getStoredConfigs(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem('agentConfigs') || '{}') } catch { return {} }
}
function storeConfig(name: string, value: string) {
  const c = getStoredConfigs(); c[name] = value
  localStorage.setItem('agentConfigs', JSON.stringify(c))
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
  agentColor: string
  agentLight: string
  agentBorder: string
  onApprove: () => void
  onDismiss: () => void
  onToggleChat: () => void
  onChatInputChange: (v: string) => void
  onChatSend: (text: string) => void
}

function SignalCard({ card, status, isApproving, chatOpen, chatMessages, chatInput, chatStreaming, agentColor, agentLight, agentBorder, onApprove, onDismiss, onToggleChat, onChatInputChange, onChatSend }: SignalCardProps) {
  const isDone = status !== 'pending'
  const chatBottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  return (
    <div style={{
      background: 'white', borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${status === 'approved' ? '#86EFAC' : status === 'dismissed' ? '#E2E8F0' : chatOpen ? agentBorder : '#E2E8F0'}`,
      opacity: status === 'dismissed' ? 0.5 : 1,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', transition: 'border-color 0.15s',
    }}>
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: isDone ? '#CBD5E1' : SEV_COLOR[card.severity], boxShadow: isDone ? 'none' : `0 0 5px ${SEV_COLOR[card.severity]}88` }} />
            <span style={{ fontSize: 11, color: '#94A3B8' }}>{SEV_LABEL[card.severity]}</span>
          </div>
          {status === 'approved' && <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 600 }}>✓ Approved</span>}
          {status === 'dismissed' && <span style={{ fontSize: 12, color: '#CBD5E1' }}>Dismissed</span>}
        </div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: isDone ? '#94A3B8' : '#1E293B', lineHeight: 1.4, marginBottom: 8 }}>{card.title}</h3>
        <p style={{ fontSize: 13, color: '#64748B', marginBottom: 12, lineHeight: 1.5 }}>{card.impact}</p>
        {!isDone && (
          <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: MONO, marginBottom: 12, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 4, padding: '3px 8px', display: 'inline-block' }}>
            {card.mutations.length} mutations · {card.affectedSkus.length} SKUs
          </div>
        )}
        {!isDone && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button onClick={onApprove} disabled={isApproving} style={{ background: isApproving ? '#F8FAFC' : '#F0FDF4', border: `1px solid ${isApproving ? '#E2E8F0' : '#86EFAC'}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: isApproving ? '#CBD5E1' : '#22C55E', cursor: isApproving ? 'not-allowed' : 'pointer', fontFamily: SANS }}>
              {isApproving ? 'Applying…' : '✓ Approve'}
            </button>
            <button onClick={onDismiss} style={{ background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 14px', fontSize: 12, color: '#94A3B8', cursor: 'pointer', fontFamily: SANS }}>
              Dismiss
            </button>
            <button onClick={onToggleChat} style={{ background: chatOpen ? agentLight : 'transparent', border: `1px solid ${chatOpen ? agentBorder : '#E2E8F0'}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: chatOpen ? 600 : 400, color: chatOpen ? agentColor : '#94A3B8', cursor: 'pointer', fontFamily: SANS, marginLeft: 'auto' }}>
              {chatOpen ? 'Close' : 'Ask Why →'}
            </button>
          </div>
        )}
      </div>
      {chatOpen && (
        <div style={{ borderTop: `1px solid ${agentBorder}`, background: agentLight }}>
          <div style={{ maxHeight: 200, overflowY: 'auto', padding: '12px 14px' }}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 8, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '90%', background: msg.role === 'user' ? agentColor : 'white', border: msg.role === 'assistant' ? '1px solid #E2E8F0' : 'none', borderRadius: 7, padding: '7px 11px', fontSize: 12, color: msg.role === 'user' ? 'white' : '#1E293B', lineHeight: 1.5 }}>
                  {msg.content || (chatStreaming && i === chatMessages.length - 1 ? <span style={{ color: agentColor }}>▍</span> : null)}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
          <div style={{ padding: '8px 14px', borderTop: `1px solid ${agentBorder}`, display: 'flex', gap: 7 }}>
            <input value={chatInput} onChange={(e) => onChatInputChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && chatInput.trim() && !chatStreaming) { e.preventDefault(); onChatSend(chatInput) } }} placeholder="Follow up…" disabled={chatStreaming} style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: SANS, background: chatStreaming ? '#F8FAFC' : 'white' }} />
            <button onClick={() => onChatSend(chatInput)} disabled={chatStreaming || !chatInput.trim()} style={{ background: chatStreaming || !chatInput.trim() ? '#F1F5F9' : agentColor, border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 700, color: chatStreaming || !chatInput.trim() ? '#94A3B8' : 'white', cursor: chatStreaming || !chatInput.trim() ? 'not-allowed' : 'pointer' }}>→</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [cards, setCards] = useState<ActionCard[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [cardStatus, setCardStatus] = useState<Record<string, CardStatus>>({})
  const [approving, setApproving] = useState<Record<string, boolean>>({})

  const [selectedAgent, setSelectedAgent] = useState<string>(AGENT_DEFS[0].name)
  const [activeSection, setActiveSection] = useState<'signals' | 'configure' | 'query'>('signals')

  // Card chat (Ask Why)
  const [cardChatOpen, setCardChatOpen] = useState<string | null>(null)
  const [cardChats, setCardChats] = useState<Record<string, Message[]>>({})
  const [cardChatInput, setCardChatInput] = useState<Record<string, string>>({})
  const [cardChatStreaming, setCardChatStreaming] = useState<Record<string, boolean>>({})

  // Agent configure
  const [agentConfigs, setAgentConfigs] = useState<Record<string, string>>({})
  const [configChat, setConfigChat] = useState<Record<string, Message[]>>({})
  const [configInput, setConfigInput] = useState('')
  const [configStreaming, setConfigStreaming] = useState(false)

  // Agent query
  const [queryChat, setQueryChat] = useState<Record<string, Message[]>>({})
  const [queryInput, setQueryInput] = useState('')
  const [queryStreaming, setQueryStreaming] = useState(false)

  const configBottomRef = useRef<HTMLDivElement>(null)
  const queryBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/insights').then((r) => r.json()).then((data) => {
      if (data.cards) setCards(data.cards)
      setLoading(false)
    }).catch(() => setLoading(false))
    // Load persisted configs
    setAgentConfigs(getStoredConfigs())
  }, [])

  useEffect(() => { configBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [configChat])
  useEffect(() => { queryBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [queryChat])

  const agentCards = cards?.filter((c) => c.agentSource === selectedAgent) ?? []
  const agent = agentDef(selectedAgent)

  async function handleApprove(card: ActionCard) {
    setApproving((p) => ({ ...p, [card.id]: true }))
    try {
      const res = await fetch('/api/actions/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card }) })
      const data = await res.json()
      if (data.ok) setCardStatus((p) => ({ ...p, [card.id]: 'approved' }))
    } finally {
      setApproving((p) => ({ ...p, [card.id]: false }))
    }
  }

  async function handleDismiss(card: ActionCard) {
    await fetch('/api/actions/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card }) })
    setCardStatus((p) => ({ ...p, [card.id]: 'dismissed' }))
  }

  async function sendCardChat(cardId: string, card: ActionCard, userText: string) {
    const prev = cardChats[cardId] || []
    const newMessages: Message[] = [...prev, { role: 'user', content: userText }]
    setCardChats((p) => ({ ...p, [cardId]: [...newMessages, { role: 'assistant', content: '' }] }))
    setCardChatStreaming((p) => ({ ...p, [cardId]: true }))
    setCardChatInput((p) => ({ ...p, [cardId]: '' }))
    const res = await fetch('/api/card-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card, messages: newMessages, agentConfig: agentConfigs[card.agentSource] }) })
    const reader = res.body!.getReader(); const decoder = new TextDecoder(); let text = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      text += decoder.decode(value, { stream: true })
      setCardChats((p) => { const msgs = [...(p[cardId] || [])]; msgs[msgs.length - 1] = { role: 'assistant', content: text }; return { ...p, [cardId]: msgs } })
    }
    setCardChatStreaming((p) => ({ ...p, [cardId]: false }))
  }

  async function handleAskWhy(card: ActionCard) {
    if (cardChatOpen === card.id) { setCardChatOpen(null); return }
    setCardChatOpen(card.id)
    if (!cardChats[card.id]?.length) await sendCardChat(card.id, card, 'Why did you flag this?')
  }

  async function sendConfigChat(text: string) {
    if (!text.trim()) return
    const prev = configChat[selectedAgent] || []
    const newMessages: Message[] = [...prev, { role: 'user', content: text }]
    setConfigChat((p) => ({ ...p, [selectedAgent]: [...newMessages, { role: 'assistant', content: '' }] }))
    setConfigInput('')
    setConfigStreaming(true)
    const res = await fetch('/api/agent-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentName: selectedAgent, messages: newMessages, currentConfig: agentConfigs[selectedAgent] }) })
    const reader = res.body!.getReader(); const decoder = new TextDecoder(); let responseText = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      responseText += decoder.decode(value, { stream: true })
      setConfigChat((p) => { const msgs = [...(p[selectedAgent] || [])]; msgs[msgs.length - 1] = { role: 'assistant', content: responseText }; return { ...p, [selectedAgent]: msgs } })
    }
    const updatedConfigs = { ...agentConfigs, [selectedAgent]: text }
    setAgentConfigs(updatedConfigs)
    storeConfig(selectedAgent, text)
    setConfigStreaming(false)
  }

  async function sendQueryChat(text: string) {
    if (!text.trim() || queryStreaming) return
    const prev = queryChat[selectedAgent] || []
    const newMessages: Message[] = [...prev, { role: 'user', content: text }]
    setQueryChat((p) => ({ ...p, [selectedAgent]: [...newMessages, { role: 'assistant', content: '' }] }))
    setQueryInput('')
    setQueryStreaming(true)
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: newMessages }) })
    const reader = res.body!.getReader(); const decoder = new TextDecoder(); let responseText = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      responseText += decoder.decode(value, { stream: true })
      setQueryChat((p) => { const msgs = [...(p[selectedAgent] || [])]; msgs[msgs.length - 1] = { role: 'assistant', content: responseText }; return { ...p, [selectedAgent]: msgs } })
    }
    setQueryStreaming(false)
  }

  return (
    <div style={{ paddingTop: 56, minHeight: '100vh', background: '#F8FAFC', fontFamily: SANS }}>

      {/* ── Page header ── */}
      <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '20px 28px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Agents</h1>
        <p style={{ fontSize: 14, color: '#64748B' }}>View signals, query agents, and configure their behavior.</p>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 56px - 77px)', overflow: 'hidden' }}>

        {/* ── Agent list sidebar ── */}
        <aside style={{ width: 260, background: 'white', borderRight: '1px solid #E2E8F0', overflowY: 'auto', flexShrink: 0, padding: '16px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>Select Agent</div>
          {AGENT_DEFS.map((a) => {
            const aCards = cards?.filter((c) => c.agentSource === a.name) ?? []
            const pendingCount = aCards.filter((c) => (cardStatus[c.id] || 'pending') === 'pending').length
            const isSelected = selectedAgent === a.name
            return (
              <button
                key={a.name}
                onClick={() => { setSelectedAgent(a.name); setActiveSection('signals') }}
                style={{
                  width: '100%', textAlign: 'left', background: isSelected ? a.light : 'transparent',
                  border: `1px solid ${isSelected ? a.border : '#E2E8F0'}`, borderRadius: 9,
                  padding: '12px', marginBottom: 8, cursor: 'pointer', fontFamily: SANS,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 18 }}>{a.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? a.color : '#1E293B' }}>{a.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 12, color: a.color, fontWeight: 700 }}>{pendingCount}</span>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>pending signals</span>
                </div>
                {agentConfigs[a.name] && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#64748B', fontStyle: 'italic', lineHeight: 1.3 }}>
                    "{agentConfigs[a.name].slice(0, 50)}{agentConfigs[a.name].length > 50 ? '…' : ''}"
                  </div>
                )}
              </button>
            )
          })}
        </aside>

        {/* ── Main content ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Section tabs + agent header */}
          <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '0 24px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 10, borderBottom: '1px solid #F1F5F9', marginBottom: -1 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: agent.light, border: `2px solid ${agent.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{agent.icon}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: agent.color }}>{selectedAgent}</div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>{agent.desc}</div>
              </div>
            </div>
            <div style={{ display: 'flex' }}>
              {([
                { key: 'signals' as const,   label: `Signals (${agentCards.length})` },
                { key: 'configure' as const, label: '⚙ Configure'                   },
                { key: 'query' as const,     label: '💬 Query Agent'                 },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveSection(tab.key)}
                  style={{
                    background: 'transparent', border: 'none',
                    borderBottom: `2px solid ${activeSection === tab.key ? agent.color : 'transparent'}`,
                    padding: '10px 18px', fontSize: 13, fontWeight: 600,
                    color: activeSection === tab.key ? agent.color : '#94A3B8',
                    cursor: 'pointer', marginBottom: -1, fontFamily: SANS, transition: 'color 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Signals ── */}
          {activeSection === 'signals' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 14 }}>Loading signals…</div>
              ) : agentCards.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <div style={{ fontSize: 15, color: '#CBD5E1', marginBottom: 6 }}>No signals from this agent</div>
                  <div style={{ fontSize: 13, color: '#E2E8F0' }}>The agent hasn't flagged anything yet.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                  {agentCards.map((card) => (
                    <SignalCard
                      key={card.id}
                      card={card}
                      status={cardStatus[card.id] || 'pending'}
                      isApproving={approving[card.id] || false}
                      chatOpen={cardChatOpen === card.id}
                      chatMessages={cardChats[card.id] || []}
                      chatInput={cardChatInput[card.id] || ''}
                      chatStreaming={cardChatStreaming[card.id] || false}
                      agentColor={agent.color}
                      agentLight={agent.light}
                      agentBorder={agent.border}
                      onApprove={() => handleApprove(card)}
                      onDismiss={() => handleDismiss(card)}
                      onToggleChat={() => {
                        if (cardChatOpen === card.id) { setCardChatOpen(null); return }
                        setCardChatOpen(card.id)
                        if (!cardChats[card.id]?.length) sendCardChat(card.id, card, 'Why did you flag this?')
                      }}
                      onChatInputChange={(v) => setCardChatInput((p) => ({ ...p, [card.id]: v }))}
                      onChatSend={(text) => sendCardChat(card.id, card, text)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Configure ── */}
          {activeSection === 'configure' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', background: agent.light, borderBottom: `1px solid ${agent.border}`, flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: agent.color, marginBottom: 4 }}>Configure {selectedAgent}</div>
                <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
                  Tell this agent what to focus on. Instructions are stored and used in future signal explanations.
                  {agentConfigs[selectedAgent] && (
                    <span style={{ display: 'block', marginTop: 4, fontStyle: 'italic' }}>
                      Current: "{agentConfigs[selectedAgent]}"
                    </span>
                  )}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                {(configChat[selectedAgent] || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>{agent.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>{selectedAgent}</div>
                    <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                      Send an instruction to configure this agent's focus.<br />
                      e.g. "Only flag SKUs with sell-through below 30%"
                    </div>
                    {['Only flag SKUs with more than 20 weeks of supply', 'Focus on Electronics and Beauty categories', 'Be more aggressive with markdown recommendations'].map((s) => (
                      <button key={s} onClick={() => sendConfigChat(s)} style={{ display: 'block', width: '100%', maxWidth: 400, margin: '8px auto 0', background: 'white', border: `1px solid ${agent.border}`, borderRadius: 7, padding: '9px 16px', fontSize: 12, color: '#64748B', cursor: 'pointer', fontFamily: SANS, textAlign: 'left' }}>{s}</button>
                    ))}
                  </div>
                ) : (
                  (configChat[selectedAgent] || []).map((msg, i) => (
                    <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '80%', background: msg.role === 'user' ? agent.light : '#F8FAFC', border: `1px solid ${msg.role === 'user' ? agent.border : '#E2E8F0'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1E293B', lineHeight: 1.5 }}>
                        {msg.content || (configStreaming && i === (configChat[selectedAgent] || []).length - 1 ? <span style={{ color: agent.color }}>▍</span> : null)}
                      </div>
                    </div>
                  ))
                )}
                <div ref={configBottomRef} />
              </div>
              <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 8 }}>
                <input value={configInput} onChange={(e) => setConfigInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && configInput.trim() && !configStreaming) { e.preventDefault(); sendConfigChat(configInput) } }} placeholder={`Instruct ${selectedAgent}…`} disabled={configStreaming} style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontFamily: SANS, background: configStreaming ? '#F8FAFC' : 'white' }} />
                <button onClick={() => sendConfigChat(configInput)} disabled={configStreaming || !configInput.trim()} style={{ background: configStreaming || !configInput.trim() ? '#F1F5F9' : agent.color, border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: configStreaming || !configInput.trim() ? '#94A3B8' : 'white', cursor: configStreaming || !configInput.trim() ? 'not-allowed' : 'pointer', fontFamily: SANS }}>Send</button>
              </div>
            </div>
          )}

          {/* ── Query ── */}
          {activeSection === 'query' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '14px 24px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', flexShrink: 0, fontSize: 13, color: '#64748B' }}>
                Ask {selectedAgent} questions about your data. It has full access to your live product catalog.
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                {(queryChat[selectedAgent] || []).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 14 }}>Suggested questions for {selectedAgent}:</div>
                    {[
                      'Which products should I act on first?',
                      'What's the total revenue impact of your recommendations?',
                      'Are there any categories I'm over-indexed on?',
                    ].map((q) => (
                      <button key={q} onClick={() => sendQueryChat(q)} style={{ display: 'block', width: '100%', maxWidth: 420, margin: '0 auto 8px', background: 'white', border: `1px solid ${agent.border}`, borderRadius: 7, padding: '9px 16px', fontSize: 12, color: '#64748B', cursor: 'pointer', fontFamily: SANS, textAlign: 'left' }}>{q}</button>
                    ))}
                  </div>
                )}
                {(queryChat[selectedAgent] || []).map((msg, i) => (
                  <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '80%', background: msg.role === 'user' ? '#1E293B' : '#F8FAFC', border: msg.role === 'assistant' ? '1px solid #E2E8F0' : 'none', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: msg.role === 'user' ? 'white' : '#1E293B', lineHeight: 1.5 }}>
                      {msg.content || (queryStreaming && i === (queryChat[selectedAgent] || []).length - 1 ? <span style={{ color: '#F59E0B' }}>▍</span> : null)}
                    </div>
                  </div>
                ))}
                <div ref={queryBottomRef} />
              </div>
              <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 8 }}>
                <input value={queryInput} onChange={(e) => setQueryInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && queryInput.trim() && !queryStreaming) { e.preventDefault(); sendQueryChat(queryInput) } }} placeholder={`Ask ${selectedAgent}…`} disabled={queryStreaming} style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontFamily: SANS }} />
                <button onClick={() => sendQueryChat(queryInput)} disabled={queryStreaming || !queryInput.trim()} style={{ background: queryStreaming || !queryInput.trim() ? '#F1F5F9' : '#1E293B', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: queryStreaming || !queryInput.trim() ? '#94A3B8' : 'white', cursor: queryStreaming || !queryInput.trim() ? 'not-allowed' : 'pointer', fontFamily: SANS }}>Ask →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
