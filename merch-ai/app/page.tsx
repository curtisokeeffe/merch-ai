'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActionCard, Severity } from '@/lib/insights'

// ─── Types ────────────────────────────────────────────────────────────────────

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

type CardStatus = 'pending' | 'approved' | 'dismissed'

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" }

const DOT: Record<Severity, string> = { red: '#EF4444', amber: '#F59E0B', green: '#22C55E' }
const SEV_LABEL: Record<Severity, string> = { red: 'CRITICAL', amber: 'WATCH', green: 'SIGNAL' }

const AGENT_COLORS: Record<string, string> = {
  'Markdown Agent': '#EF4444',
  'Pricing Agent': '#F59E0B',
  'Assortment Agent': '#22C55E',
  'Risk Agent': '#8B5CF6',
}

// ─── Animated number hook ─────────────────────────────────────────────────────

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

// ─── AnimatedKPI component ────────────────────────────────────────────────────

function AnimatedKPI({ entry }: { entry: KPIEntry }) {
  const animated = useAnimatedNumber(entry.raw)

  function format(n: number): string {
    if (entry.key === 'inventoryValue' || entry.key === 'historicalRevenue') {
      return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    }
    if (entry.key === 'avgMarginPct' || entry.key === 'avgSellThrough') {
      return `${n.toFixed(1)}%`
    }
    return Math.round(n).toString()
  }

  return (
    <div style={{ background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 5, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>
        {entry.label}
      </div>
      <div style={{ ...MONO, fontSize: 20, fontWeight: 600, color: '#F59E0B', lineHeight: 1 }}>
        {format(animated)}
      </div>
    </div>
  )
}

// ─── Activity log simulation ──────────────────────────────────────────────────

function useActivityLog(cards: ActionCard[] | null, agent: string | null) {
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    if (!cards || !agent) { setLines([]); return }

    const relevant = cards.filter((c) => c.agentSource === agent)
    const allSkus = relevant.flatMap((c) => c.affectedSkus)
    const now = new Date()
    const ts = () => now.toTimeString().slice(0, 8)

    const script = [
      `[${ts()}] Loading live product catalog from database...`,
      `[${ts()}] ${cards.length} SKUs loaded across ${[...new Set(cards.map(() => agent))].length > 1 ? 'multiple' : '3'} categories`,
      `[${ts()}] Checking action_log for previously approved changes...`,
      ...(allSkus.length > 0
        ? [`[${ts()}] Analysing ${relevant.length} signal area${relevant.length !== 1 ? 's' : ''} for ${agent}...`]
        : []),
      `[${ts()}] Running heuristic queries against live_products...`,
      `[${ts()}] Scoring SKUs by sell-through, weeks-of-supply, margin...`,
      ...(allSkus.length > 0
        ? [`[${ts()}] ↳ Flagged SKUs: ${allSkus.slice(0, 6).join(', ')}${allSkus.length > 6 ? '...' : ''}`]
        : []),
      `[${ts()}] Generating ${relevant.length} recommendation${relevant.length !== 1 ? 's' : ''} with mutation payloads...`,
      `[${ts()}] ✓ Analysis complete — ${relevant.length} action${relevant.length !== 1 ? 's' : ''} ready for review`,
    ]

    setLines([])
    let i = 0
    const id = setInterval(() => {
      if (i >= script.length) { clearInterval(id); return }
      setLines((prev) => [...prev, script[i]])
      i++
    }, 280)
    return () => clearInterval(id)
  }, [agent, cards])

  return lines
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [kpis, setKpis] = useState<KPIEntry[]>([])
  const [cards, setCards] = useState<ActionCard[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [cardStatus, setCardStatus] = useState<Record<string, CardStatus>>({})
  const [approving, setApproving] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [explanations, setExplanations] = useState<Record<string, string>>({})
  const [explaining, setExplaining] = useState<Record<string, boolean>>({})

  const [activeTab, setActiveTab] = useState<'signals' | 'changes'>('signals')
  const [changes, setChanges] = useState<ChangeEntry[]>([])
  const [changesLoading, setChangesLoading] = useState(false)

  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  const activityLines = useActivityLog(cards, activeAgent)

  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [asking, setAsking] = useState(false)
  const answerRef = useRef<HTMLDivElement>(null)
  const activityRef = useRef<HTMLDivElement>(null)

  const [resetting, setResetting] = useState(false)

  // Scroll activity log to bottom
  useEffect(() => {
    if (activityRef.current) activityRef.current.scrollTop = activityRef.current.scrollHeight
  }, [activityLines])

  const loadKPIs = useCallback(async () => {
    const res = await fetch('/api/kpis')
    const data = await res.json()
    if (data.kpis) setKpis(data.kpis)
  }, [])

  const loadChanges = useCallback(async () => {
    setChangesLoading(true)
    const res = await fetch('/api/changes')
    const data = await res.json()
    if (data.changes) setChanges(data.changes)
    setChangesLoading(false)
  }, [])

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
      if (activeTab === 'changes') loadChanges()
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

  async function handleExplain(card: ActionCard) {
    if (expanded === card.id) { setExpanded(null); return }
    setExpanded(card.id)
    if (explanations[card.id]) return
    setExplaining((p) => ({ ...p, [card.id]: true }))
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: card.context, dataSummary: card.dataSummary }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setExplanations((p) => ({ ...p, [card.id]: text }))
      }
    } finally {
      setExplaining((p) => ({ ...p, [card.id]: false }))
    }
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || asking) return
    setAsking(true)
    setAnswer('')
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setAnswer(text)
        setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0)
      }
    } finally {
      setAsking(false)
    }
  }

  async function handleReset() {
    setResetting(true)
    const res = await fetch('/api/reset', { method: 'POST' })
    const data = await res.json()
    if (data.kpis) setKpis(data.kpis)
    setCardStatus({})
    setExplanations({})
    setExpanded(null)
    setChanges([])
    setAnswer('')
    setActiveAgent(null)
    // Reload insights from freshly reset data
    const ins = await fetch('/api/insights').then((r) => r.json())
    if (ins.cards) setCards(ins.cards)
    setResetting(false)
  }

  if (loading) {
    return (
      <div style={{ background: '#1a1a1a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...MONO, color: '#F59E0B', fontSize: 12, letterSpacing: '2px' }}>INITIALISING DATABASE</div>
          <div style={{ color: '#333', fontSize: 11, marginTop: 6 }}>Seeding from CSV on first run...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ background: '#1a1a1a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ background: '#1e1010', border: '1px solid #3d1515', borderRadius: 6, padding: '20px 24px', maxWidth: 600 }}>
          <div style={{ color: '#EF4444', fontSize: 11, fontWeight: 600, letterSpacing: '1px', marginBottom: 8 }}>LOAD ERROR</div>
          <div style={{ ...MONO, color: '#aaa', fontSize: 12 }}>{error}</div>
        </div>
      </div>
    )
  }

  const agents = [...new Set((cards ?? []).map((c) => c.agentSource))]
  const now = new Date()

  return (
    <main style={{ background: '#1a1a1a', minHeight: '100vh', color: '#e5e5e5', padding: '18px 28px 48px', ...SANS }}>

      {/* ── Header ── */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#F59E0B', letterSpacing: '-0.5px' }}>MerchAI</span>
            <span style={{ background: '#2a2000', border: '1px solid #4a3800', borderRadius: 3, padding: '1px 7px', ...MONO, fontSize: 9, color: '#F59E0B', letterSpacing: '1px' }}>SIGNAL BRIEF</span>
          </div>
          <div style={{ fontSize: 11, color: '#555' }}>Live database · mutations tracked · {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
        </div>
        <button
          onClick={handleReset}
          disabled={resetting}
          style={{
            background: 'transparent',
            border: '1px solid #2a2a2a',
            borderRadius: 4,
            padding: '6px 14px',
            fontSize: 11,
            color: resetting ? '#444' : '#666',
            cursor: resetting ? 'not-allowed' : 'pointer',
            ...MONO,
            letterSpacing: '0.5px',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { if (!resetting) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#444'; (e.currentTarget as HTMLButtonElement).style.color = '#aaa' } }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a2a'; (e.currentTarget as HTMLButtonElement).style.color = resetting ? '#444' : '#666' }}
        >
          {resetting ? 'Resetting...' : '↺ Reset Demo'}
        </button>
      </header>

      {/* ── KPI Bar ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 22 }}>
        {kpis.map((k) => <AnimatedKPI key={k.key} entry={k} />)}
      </section>

      {/* ── Agent Deploy Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '1px', marginRight: 4 }}>Deploy agent:</span>
        {agents.map((agent) => (
          <button
            key={agent}
            onClick={() => setActiveAgent(activeAgent === agent ? null : agent)}
            style={{
              background: activeAgent === agent ? `${AGENT_COLORS[agent] || '#F59E0B'}18` : 'transparent',
              border: `1px solid ${activeAgent === agent ? (AGENT_COLORS[agent] || '#F59E0B') : '#2a2a2a'}`,
              borderRadius: 4,
              padding: '4px 12px',
              fontSize: 11,
              color: activeAgent === agent ? (AGENT_COLORS[agent] || '#F59E0B') : '#555',
              cursor: 'pointer',
              ...SANS,
              transition: 'all 0.15s',
            }}
          >
            {agent}
          </button>
        ))}
      </div>

      {/* ── Activity Log ── */}
      {activeAgent && (
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 5, padding: '10px 14px', marginBottom: 16, maxHeight: 160, overflowY: 'auto' }} ref={activityRef}>
          <div style={{ ...MONO, fontSize: 10, color: '#444', letterSpacing: '1px', marginBottom: 6 }}>
            {activeAgent.toUpperCase()} · ACTIVITY LOG
          </div>
          {activityLines.map((line, i) => (
            <div key={i} style={{ ...MONO, fontSize: 11, color: line.includes('✓') ? '#22C55E' : line.includes('↳') ? '#F59E0B' : '#666', marginBottom: 2 }}>
              {line}
            </div>
          ))}
          {activityLines.length < 9 && (
            <span style={{ ...MONO, fontSize: 11, color: '#333' }}>▍</span>
          )}
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '1px solid #222' }}>
        {(['signals', 'changes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); if (tab === 'changes') loadChanges() }}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab ? '#F59E0B' : 'transparent'}`,
              padding: '6px 16px',
              fontSize: 11,
              fontWeight: 600,
              color: activeTab === tab ? '#F59E0B' : '#555',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: -1,
              ...SANS,
              transition: 'color 0.15s',
            }}
          >
            {tab === 'signals' ? `Signals (${cards?.length ?? 0})` : `Changes (${changes.length})`}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 6 }}>
          {(['red', 'amber', 'green'] as Severity[]).map((s) => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#444' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: DOT[s], display: 'inline-block' }} />
              {SEV_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      {/* ── Signals Tab ── */}
      {activeTab === 'signals' && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 32 }}>
          {cards?.map((card) => (
            <ActionCardComponent
              key={card.id}
              card={card}
              status={cardStatus[card.id] || 'pending'}
              isExpanded={expanded === card.id}
              explanation={explanations[card.id]}
              isExplaining={explaining[card.id] || false}
              isApproving={approving[card.id] || false}
              onExplain={handleExplain}
              onApprove={handleApprove}
              onDismiss={handleDismiss}
            />
          ))}
        </section>
      )}

      {/* ── Changes Tab ── */}
      {activeTab === 'changes' && (
        <section style={{ marginBottom: 32 }}>
          {changesLoading ? (
            <div style={{ ...MONO, fontSize: 11, color: '#444', padding: '20px 0' }}>Loading...</div>
          ) : changes.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              <div style={{ color: '#333', fontSize: 12 }}>No actions taken yet.</div>
              <div style={{ color: '#2a2a2a', fontSize: 11, marginTop: 4 }}>Approve a signal to see mutations logged here.</div>
            </div>
          ) : (
            <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 5, overflow: 'hidden' }}>
              {changes.map((entry, ei) => (
                <div key={entry.actionId}>
                  {ei > 0 && <div style={{ height: 1, background: '#1a1a1a' }} />}
                  <div style={{ padding: '12px 16px' }}>
                    {/* Entry header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: AGENT_COLORS[entry.agentSource] || '#F59E0B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {entry.agentSource}
                        </span>
                        <span style={{ fontSize: 11, color: '#aaa' }}>{entry.title}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ ...MONO, fontSize: 10, color: '#444' }}>
                          {entry.approvedAt ? new Date(entry.approvedAt).toTimeString().slice(0, 8) : ''}
                        </span>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: '0.5px',
                          padding: '2px 6px',
                          borderRadius: 2,
                          background: entry.status === 'approved' ? '#0a2015' : '#1a0a0a',
                          color: entry.status === 'approved' ? '#22C55E' : '#EF4444',
                          border: `1px solid ${entry.status === 'approved' ? '#1a4025' : '#3a1515'}`,
                        }}>
                          {entry.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    {/* Mutation rows */}
                    {entry.mutations.map((m, mi) => (
                      <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ ...MONO, fontSize: 10, color: '#555', width: 70, flexShrink: 0 }}>{m.sku_id}</span>
                        <span style={{ fontSize: 10, color: '#444' }}>{m.field.replace(/_/g, ' ')}</span>
                        <span style={{ ...MONO, fontSize: 10, color: '#555' }}>
                          {typeof m.before === 'number' ? m.before.toFixed(2) : String(m.before)}
                        </span>
                        <span style={{ color: '#333', fontSize: 10 }}>→</span>
                        <span style={{ ...MONO, fontSize: 10, color: m.field.includes('price') ? '#F59E0B' : '#e5e5e5' }}>
                          {typeof m.after === 'number' ? m.after.toFixed(2) : String(m.after)}
                        </span>
                        {typeof m.before === 'number' && typeof m.after === 'number' && m.field.includes('price') && (
                          <span style={{ ...MONO, fontSize: 9, color: m.after < m.before ? '#EF4444' : '#22C55E' }}>
                            ({m.after < m.before ? '' : '+'}{(((m.after - m.before) / m.before) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Ask section ── */}
      <section style={{ borderTop: '1px solid #1e1e1e', paddingTop: 20 }}>
        <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 10 }}>
          Ask Your Data Anything
        </div>
        <form onSubmit={handleAsk} style={{ display: 'flex', gap: 8 }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Which SKUs should I prioritise for Q1 promotions?"
            style={{
              flex: 1,
              background: '#1e1e1e',
              border: '1px solid #2a2a2a',
              borderRadius: 4,
              padding: '9px 14px',
              color: '#e5e5e5',
              fontSize: 12,
              ...SANS,
            }}
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            style={{
              background: asking || !question.trim() ? '#1e1e1e' : '#F59E0B',
              border: `1px solid ${asking || !question.trim() ? '#2a2a2a' : '#F59E0B'}`,
              borderRadius: 4,
              padding: '9px 20px',
              color: asking || !question.trim() ? '#444' : '#111',
              fontSize: 12,
              fontWeight: 600,
              cursor: asking || !question.trim() ? 'not-allowed' : 'pointer',
              ...SANS,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {asking ? 'Analysing…' : 'Ask →'}
          </button>
        </form>
        {answer && (
          <div ref={answerRef} style={{ marginTop: 10, background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 4, padding: '12px 16px' }}>
            <div style={{ fontSize: 9, color: '#444', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>AI Response · Live Data</div>
            <p style={{ fontSize: 12, color: '#bbb', lineHeight: 1.75, margin: 0 }}>
              {answer}
              {asking && <span style={{ color: '#F59E0B' }}>▍</span>}
            </p>
          </div>
        )}
      </section>
    </main>
  )
}

// ─── ActionCard component ─────────────────────────────────────────────────────

interface CardProps {
  card: ActionCard
  status: CardStatus
  isExpanded: boolean
  explanation?: string
  isExplaining: boolean
  isApproving: boolean
  onExplain: (c: ActionCard) => void
  onApprove: (c: ActionCard) => void
  onDismiss: (c: ActionCard) => void
}

function ActionCardComponent({
  card, status, isExpanded, explanation, isExplaining, isApproving,
  onExplain, onApprove, onDismiss
}: CardProps) {
  const [hovered, setHovered] = useState(false)
  const isDone = status !== 'pending'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: status === 'approved' ? '#0d1a10' : status === 'dismissed' ? '#141414' : isExpanded ? '#1e1c14' : hovered ? '#202020' : '#1e1e1e',
        border: `1px solid ${status === 'approved' ? '#1a3a20' : status === 'dismissed' ? '#222' : isExpanded ? '#3a2e00' : hovered ? '#333' : '#252525'}`,
        borderRadius: 5,
        padding: '13px',
        transform: hovered && !isDone && !isExpanded ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.15s, border-color 0.15s, background 0.15s',
        opacity: status === 'dismissed' ? 0.45 : 1,
        position: 'relative',
      } as React.CSSProperties}
    >
      {/* Agent badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{
          fontSize: 9,
          color: AGENT_COLORS[card.agentSource] || '#F59E0B',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          fontWeight: 600,
        }}>
          {card.agentSource}
        </span>
        {status === 'approved' && (
          <span style={{ fontSize: 9, color: '#22C55E', fontWeight: 600, letterSpacing: '0.5px' }}>✓ APPROVED</span>
        )}
        {status === 'dismissed' && (
          <span style={{ fontSize: 9, color: '#555', letterSpacing: '0.5px' }}>DISMISSED</span>
        )}
      </div>

      {/* Severity + title */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
        <div style={{ flexShrink: 0, marginTop: 4 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isDone ? '#333' : DOT[card.severity],
            boxShadow: isDone ? 'none' : `0 0 5px ${DOT[card.severity]}55`,
          }} />
        </div>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: isDone ? '#555' : '#ddd', lineHeight: 1.4, margin: 0 }}>
          {card.title}
        </h3>
      </div>

      {/* Impact */}
      <p style={{ fontSize: 11, color: '#555', margin: '0 0 10px 13px', lineHeight: 1.5 }}>
        {card.impact}
      </p>

      {/* Mutation count pill */}
      {card.mutations.length > 0 && !isDone && (
        <div style={{ marginLeft: 13, marginBottom: 10 }}>
          <span style={{ ...MONO, fontSize: 9, color: '#444', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 3, padding: '2px 6px' }}>
            {card.mutations.length} mutation{card.mutations.length !== 1 ? 's' : ''} · {card.affectedSkus.length} SKU{card.affectedSkus.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Action buttons */}
      {!isDone && (
        <div style={{ display: 'flex', gap: 6, marginLeft: 13 }}>
          <button
            onClick={() => onApprove(card)}
            disabled={isApproving}
            style={{
              background: isApproving ? '#1e1e1e' : '#0d2015',
              border: `1px solid ${isApproving ? '#2a2a2a' : '#1a4025'}`,
              borderRadius: 3,
              padding: '4px 10px',
              fontSize: 10,
              fontWeight: 600,
              color: isApproving ? '#444' : '#22C55E',
              cursor: isApproving ? 'not-allowed' : 'pointer',
              ...SANS,
              transition: 'all 0.15s',
            }}
          >
            {isApproving ? 'Applying…' : '✓ Approve'}
          </button>
          <button
            onClick={() => onDismiss(card)}
            style={{
              background: 'transparent',
              border: '1px solid #2a2a2a',
              borderRadius: 3,
              padding: '4px 10px',
              fontSize: 10,
              color: '#444',
              cursor: 'pointer',
              ...SANS,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a1515'; (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a2a'; (e.currentTarget as HTMLButtonElement).style.color = '#444' }}
          >
            Dismiss
          </button>
          <button
            onClick={() => onExplain(card)}
            style={{
              background: 'transparent',
              border: `1px solid ${isExpanded ? '#3a2e00' : '#2a2a2a'}`,
              borderRadius: 3,
              padding: '4px 10px',
              fontSize: 10,
              color: isExpanded ? '#F59E0B' : '#555',
              cursor: 'pointer',
              ...SANS,
              transition: 'all 0.15s',
              marginLeft: 'auto',
            }}
          >
            {isExpanded ? 'Close' : 'Explain →'}
          </button>
        </div>
      )}

      {/* Expand / explanation */}
      {isExpanded && (
        <div style={{ marginTop: 12, marginLeft: 13, paddingTop: 10, borderTop: '1px solid #2a2500' }}>
          {isExplaining && !explanation ? (
            <span style={{ ...MONO, fontSize: 11, color: '#444' }}>Analysing<span style={{ color: '#F59E0B' }}>▍</span></span>
          ) : (
            <p style={{ fontSize: 11.5, color: '#aaa', margin: 0, lineHeight: 1.7 }}>
              {explanation}
              {isExplaining && <span style={{ color: '#F59E0B' }}>▍</span>}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
