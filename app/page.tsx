'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ActionCard, Severity } from '@/lib/insights'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KPIEntry { key: string; label: string; value: string; raw: number }
type Message = { role: 'user' | 'assistant'; content: string }

// ─── Constants ─────────────────────────────────────────────────────────────────

const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

const SEV_COLOR: Record<Severity, string> = { red: '#EF4444', amber: '#F59E0B', green: '#22C55E' }
const SEV_LABEL: Record<Severity, string> = { red: 'Critical', amber: 'Watch', green: 'Signal' }

const AGENT_DEFS = [
  { name: 'Markdown Agent',   color: '#EF4444', light: '#FEF2F2', border: '#FCA5A5', icon: '📉' },
  { name: 'Pricing Agent',    color: '#F59E0B', light: '#FFFBEB', border: '#FCD34D', icon: '💰' },
  { name: 'Assortment Agent', color: '#22C55E', light: '#F0FDF4', border: '#86EFAC', icon: '📦' },
  { name: 'Risk Agent',       color: '#8B5CF6', light: '#F5F3FF', border: '#C4B5FD', icon: '🛡' },
]

// ─── Animated number ───────────────────────────────────────────────────────────

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
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>{entry.label}</div>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: '#F59E0B' }}>{format(animated)}</div>
    </div>
  )
}

// ─── Main dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [kpis, setKpis] = useState<KPIEntry[]>([])
  const [cards, setCards] = useState<ActionCard[] | null>(null)
  const [loading, setLoading] = useState(true)

  // Chat
  const [chatHistory, setChatHistory] = useState<Message[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/kpis').then((r) => r.json()),
      fetch('/api/insights').then((r) => r.json()),
    ]).then(([kpiData, insightData]) => {
      if (kpiData.kpis) setKpis(kpiData.kpis)
      if (insightData.cards) setCards(insightData.cards)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

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

  // Top signals (red first, then amber, then green — max 3)
  const topSignals = cards
    ? [...cards].sort((a, b) => {
        const order = { red: 0, amber: 1, green: 2 }
        return order[a.severity] - order[b.severity]
      }).slice(0, 3)
    : []

  const now = new Date()

  if (loading) {
    return (
      <div style={{ paddingTop: 56, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#F59E0B', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Loading dashboard…</div>
          <div style={{ color: '#94A3B8', fontSize: 13 }}>Connecting to live database</div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-shell" style={{ paddingTop: 56, fontFamily: SANS }}>

      {/* ── Header ── */}
      <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '16px 28px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 3 }}>Good morning 👋</h1>
            <div style={{ fontSize: 13, color: '#94A3B8' }}>
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · Live database · {cards?.length ?? 0} signals ready
            </div>
          </div>
          <Link href="/agents" style={{
            background: '#F59E0B', color: 'white', border: 'none', borderRadius: 8,
            padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            textDecoration: 'none', display: 'inline-block',
          }}>
            View All Agents →
          </Link>
        </div>
        {/* KPI bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {kpis.map((k) => <AnimatedKPI key={k.key} entry={k} />)}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: Top signals + Agent cards ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>

          {/* Top priority signals */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B' }}>Top Priority Signals</h2>
              <Link href="/agents" style={{ fontSize: 13, color: '#F59E0B', fontWeight: 600 }}>
                See all {cards?.length ?? 0} →
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {topSignals.map((card) => {
                const agent = AGENT_DEFS.find((a) => a.name === card.agentSource) ?? AGENT_DEFS[1]
                return (
                  <div key={card.id} style={{
                    background: 'white', border: '1px solid #E2E8F0', borderRadius: 10,
                    padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: agent.color,
                        background: agent.light, border: `1px solid ${agent.border}`,
                        padding: '2px 8px', borderRadius: 4,
                      }}>
                        {agent.icon} {card.agentSource}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[card.severity], boxShadow: `0 0 5px ${SEV_COLOR[card.severity]}88` }} />
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>{SEV_LABEL[card.severity]}</span>
                      </div>
                    </div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', marginBottom: 6, lineHeight: 1.4 }}>{card.title}</h3>
                    <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, marginBottom: 12 }}>{card.impact}</p>
                    <Link href="/agents" style={{
                      display: 'inline-block', fontSize: 12, fontWeight: 600,
                      color: agent.color, background: agent.light,
                      border: `1px solid ${agent.border}`, borderRadius: 6,
                      padding: '5px 12px',
                    }}>
                      Review →
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Agent quick-deploy cards */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B' }}>Agent Overview</h2>
              <Link href="/agents" style={{ fontSize: 13, color: '#F59E0B', fontWeight: 600 }}>Configure →</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {AGENT_DEFS.map((agent) => {
                const agentCards = cards?.filter((c) => c.agentSource === agent.name) ?? []
                return (
                  <Link key={agent.name} href="/agents" style={{ textDecoration: 'none' }}>
                    <div style={{
                      background: 'white', border: '1px solid #E2E8F0', borderRadius: 10,
                      padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      transition: 'border-color 0.15s, box-shadow 0.15s', cursor: 'pointer',
                    }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = agent.border
                        ;(e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 12px ${agent.color}22`
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = '#E2E8F0'
                        ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{ fontSize: 22, marginBottom: 8 }}>{agent.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>{agent.name}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: agent.color, marginBottom: 2 }}>{agentCards.length}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>signal{agentCards.length !== 1 ? 's' : ''} pending</div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Right: Chat panel ── */}
        <div style={{
          width: 360, borderLeft: '1px solid #E2E8F0', background: 'white',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 2 }}>AI Assistant</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Ask anything about your live product data</div>
          </div>

          {/* Suggested questions */}
          {chatHistory.length === 0 && (
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Try asking
              </div>
              {[
                'Which SKUs are most at risk?',
                'What\'s driving margin compression?',
                'Which categories are overstocked?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => sendChat(q)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 7,
                    padding: '8px 12px', fontSize: 12, color: '#64748B',
                    cursor: 'pointer', marginBottom: 6, fontFamily: SANS,
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#F59E0B' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E2E8F0' }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
            {chatHistory.map((msg, i) => (
              <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '90%',
                  background: msg.role === 'user' ? '#1E293B' : '#F8FAFC',
                  border: msg.role === 'assistant' ? '1px solid #E2E8F0' : 'none',
                  borderRadius: 8, padding: '9px 12px',
                  fontSize: 13, lineHeight: 1.6,
                  color: msg.role === 'user' ? 'white' : '#1E293B',
                }}>
                  {msg.content || (chatStreaming && i === chatHistory.length - 1
                    ? <span style={{ color: '#F59E0B' }}>▍</span>
                    : null)}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 18px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 8 }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !chatStreaming && chatInput.trim()) {
                  e.preventDefault(); sendChat(chatInput)
                }
              }}
              placeholder="Ask about your data…"
              disabled={chatStreaming}
              style={{
                flex: 1, border: '1px solid #E2E8F0', borderRadius: 8,
                padding: '8px 12px', fontSize: 13, color: '#1E293B',
                background: chatStreaming ? '#F8FAFC' : 'white', fontFamily: SANS,
              }}
            />
            <button
              onClick={() => sendChat(chatInput)}
              disabled={chatStreaming || !chatInput.trim()}
              style={{
                background: chatStreaming || !chatInput.trim() ? '#F1F5F9' : '#F59E0B',
                border: 'none', borderRadius: 8, padding: '8px 14px',
                fontSize: 14, fontWeight: 700,
                color: chatStreaming || !chatInput.trim() ? '#94A3B8' : 'white',
                cursor: chatStreaming || !chatInput.trim() ? 'not-allowed' : 'pointer',
                fontFamily: SANS, transition: 'all 0.15s',
              }}
            >→</button>
            {chatHistory.length > 0 && (
              <button
                onClick={() => setChatHistory([])}
                style={{
                  background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 8,
                  padding: '8px 10px', fontSize: 12, color: '#94A3B8',
                  cursor: 'pointer', fontFamily: SANS,
                }}
              >✕</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
