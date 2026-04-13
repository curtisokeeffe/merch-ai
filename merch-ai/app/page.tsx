'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ActionCard } from '@/lib/insights'

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
interface ChatMessage { role: 'user' | 'assistant'; content: string }
interface AgentConfigState {
  instructions: string
  history: ChatMessage[]
}
interface DbPeekResponse {
  columns: string[]
  rows: Record<string, unknown>[]
  changedSkus: string[]
}

type CardStatus = 'pending' | 'approved' | 'dismissed'
type Tab = 'signals' | 'changes' | 'data-peek'

export default function Home() {
  const [kpis, setKpis] = useState<KPIEntry[]>([])
  const [cards, setCards] = useState<ActionCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<Tab>('signals')
  const [cardStatus, setCardStatus] = useState<Record<string, CardStatus>>({})
  const [approving, setApproving] = useState<Record<string, boolean>>({})

  const [changes, setChanges] = useState<ChangeEntry[]>([])
  const [changesLoading, setChangesLoading] = useState(false)

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const [cardThreads, setCardThreads] = useState<Record<string, ChatMessage[]>>({})
  const [cardInputs, setCardInputs] = useState<Record<string, string>>({})
  const [cardLoading, setCardLoading] = useState<Record<string, boolean>>({})

  const [agentConfigs, setAgentConfigs] = useState<Record<string, AgentConfigState>>({})
  const [configureAgent, setConfigureAgent] = useState<string | null>(null)
  const [agentInput, setAgentInput] = useState('')
  const [agentSaving, setAgentSaving] = useState(false)

  const [dbPeek, setDbPeek] = useState<DbPeekResponse | null>(null)
  const [dbPeekLoading, setDbPeekLoading] = useState(false)

  const agents = useMemo(() => [...new Set(cards.map((c) => c.agentSource))], [cards])

  const loadChanges = useCallback(async () => {
    setChangesLoading(true)
    try {
      const res = await fetch('/api/changes')
      const data = await res.json()
      setChanges(data.changes ?? [])
    } finally {
      setChangesLoading(false)
    }
  }, [])

  const loadDbPeek = useCallback(async () => {
    setDbPeekLoading(true)
    try {
      const res = await fetch('/api/db-peek')
      const data = await res.json()
      setDbPeek(data)
    } finally {
      setDbPeekLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/kpis').then((r) => r.json()),
      fetch('/api/insights').then((r) => r.json()),
      fetch('/api/changes').then((r) => r.json()),
    ])
      .then(([kpiData, insightData, changeData]) => {
        setKpis(kpiData.kpis ?? [])
        setCards(insightData.cards ?? [])
        setChanges(changeData.changes ?? [])
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (activeTab === 'data-peek' && !dbPeek) loadDbPeek()
    if (activeTab === 'changes' && !changes.length) loadChanges()
  }, [activeTab, dbPeek, changes.length, loadDbPeek, loadChanges])

  async function handleApprove(card: ActionCard) {
    setApproving((p) => ({ ...p, [card.id]: true }))
    try {
      const res = await fetch('/api/actions/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card }),
      })
      const data = await res.json()
      if (data.kpis) setKpis(data.kpis)
      setCardStatus((p) => ({ ...p, [card.id]: 'approved' }))
      await Promise.all([loadChanges(), loadDbPeek()])
    } finally {
      setApproving((p) => ({ ...p, [card.id]: false }))
    }
  }

  async function handleDismiss(card: ActionCard) {
    await fetch('/api/actions/dismiss', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card }),
    })
    setCardStatus((p) => ({ ...p, [card.id]: 'dismissed' }))
    await loadChanges()
  }

  async function submitGlobalChat(e: React.FormEvent) {
    e.preventDefault()
    if (!chatInput.trim() || chatLoading) return
    const q = chatInput.trim()
    setChatInput('')
    setChatHistory((prev) => [...prev, { role: 'user', content: q }])
    setChatLoading(true)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }),
      })
      const text = await res.text()
      setChatHistory((prev) => [...prev, { role: 'assistant', content: text }])
    } finally {
      setChatLoading(false)
    }
  }

  async function askWhy(card: ActionCard) {
    const current = cardThreads[card.id] ?? []
    if (current.length) return
    const seed = 'Why did you flag this?'
    setCardThreads((p) => ({ ...p, [card.id]: [...current, { role: 'user', content: seed }] }))
    setCardLoading((p) => ({ ...p, [card.id]: true }))
    try {
      const res = await fetch('/api/card-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card,
          history: [{ role: 'user', content: seed }],
          agentInstructions: agentConfigs[card.agentSource]?.instructions ?? '',
        }),
      })
      const data = await res.json()
      setCardThreads((p) => ({ ...p, [card.id]: [...(p[card.id] ?? []), { role: 'assistant', content: data.reply ?? '' }] }))
    } finally {
      setCardLoading((p) => ({ ...p, [card.id]: false }))
    }
  }

  async function followupCardChat(card: ActionCard) {
    const input = (cardInputs[card.id] ?? '').trim()
    if (!input || cardLoading[card.id]) return
    const history = [...(cardThreads[card.id] ?? []), { role: 'user' as const, content: input }]
    setCardInputs((p) => ({ ...p, [card.id]: '' }))
    setCardThreads((p) => ({ ...p, [card.id]: history }))
    setCardLoading((p) => ({ ...p, [card.id]: true }))
    try {
      const res = await fetch('/api/card-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card, history, agentInstructions: agentConfigs[card.agentSource]?.instructions ?? '' }),
      })
      const data = await res.json()
      setCardThreads((p) => ({ ...p, [card.id]: [...(p[card.id] ?? []), { role: 'assistant', content: data.reply ?? '' }] }))
    } finally {
      setCardLoading((p) => ({ ...p, [card.id]: false }))
    }
  }

  async function saveAgentConfig(e: React.FormEvent) {
    e.preventDefault()
    if (!configureAgent || !agentInput.trim() || agentSaving) return
    const agent = configureAgent
    const existing = agentConfigs[agent] ?? { instructions: '', history: [] }
    const nextHistory = [...existing.history, { role: 'user' as const, content: agentInput.trim() }]
    setAgentInput('')
    setAgentSaving(true)
    try {
      const res = await fetch('/api/agent-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, history: nextHistory, currentInstructions: existing.instructions }),
      })
      const data = await res.json()
      setAgentConfigs((p) => ({
        ...p,
        [agent]: {
          instructions: data.instructions ?? existing.instructions,
          history: [...nextHistory, { role: 'assistant', content: data.reply ?? '' }],
        },
      }))
    } finally {
      setAgentSaving(false)
    }
  }

  const agentStats = useMemo(() => {
    const byAgent: Record<string, { pending: number; approved: number; dismissed: number; value: number }> = {}
    cards.forEach((card) => {
      if (!byAgent[card.agentSource]) byAgent[card.agentSource] = { pending: 0, approved: 0, dismissed: 0, value: 0 }
      const state = cardStatus[card.id] ?? 'pending'
      byAgent[card.agentSource][state] += 1
      const valueFromText = Number((card.impact.match(/\$([\d,]+)/)?.[1] ?? '0').replaceAll(',', ''))
      byAgent[card.agentSource].value += valueFromText
    })
    return byAgent
  }, [cards, cardStatus])

  if (loading) return <main className="loading-shell">Loading dashboard...</main>
  if (error) return <main className="loading-shell">Error: {error}</main>

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <h1>MerchAI</h1>
        <p className="muted">Agent control center</p>
        {agents.map((agent) => {
          const stats = agentStats[agent] ?? { pending: 0, approved: 0, dismissed: 0, value: 0 }
          return (
            <div key={agent} className="agent-card">
              <h3>{agent}</h3>
              <p className="muted">Signals: {stats.pending + stats.approved + stats.dismissed}</p>
              <div className="breakdown">P {stats.pending} · A {stats.approved} · D {stats.dismissed}</div>
              <div className="value">Est. value ${stats.value.toLocaleString()}</div>
              <button className="btn btn-outline" onClick={() => { setConfigureAgent(agent); setAgentInput('') }}>Configure</button>
            </div>
          )
        })}
      </aside>

      <section className="main-panel">
        <div className="kpi-grid">
          {kpis.map((k) => <div className="kpi" key={k.key}><label>{k.label}</label><strong>{k.value}</strong></div>)}
        </div>

        <div className="tab-bar">
          {(['signals', 'changes', 'data-peek'] as Tab[]).map((tab) => (
            <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{tab}</button>
          ))}
        </div>

        {activeTab === 'signals' && (
          <div className="signals-grid">
            {cards.map((card) => {
              const status = cardStatus[card.id] ?? 'pending'
              const thread = cardThreads[card.id] ?? []
              return (
                <article key={card.id} className={`signal-card ${status !== 'pending' ? `status-${status}` : ''}`}>
                  <div className="signal-head">
                    <span>{card.agentSource}</span>
                    <small>{card.severity.toUpperCase()}</small>
                  </div>
                  <h3>{card.title}</h3>
                  <p>{card.impact}</p>
                  <div className="actions">
                    <button className="btn" disabled={status !== 'pending' || approving[card.id]} onClick={() => handleApprove(card)}>Approve</button>
                    <button className="btn btn-outline" disabled={status !== 'pending'} onClick={() => handleDismiss(card)}>Dismiss</button>
                    <button className="btn btn-outline" onClick={() => askWhy(card)}>Ask Why</button>
                  </div>
                  {thread.length > 0 && (
                    <div className="thread">
                      {thread.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
                      <form onSubmit={(e) => { e.preventDefault(); followupCardChat(card) }} className="thread-form">
                        <input value={cardInputs[card.id] ?? ''} onChange={(e) => setCardInputs((p) => ({ ...p, [card.id]: e.target.value }))} placeholder="Follow-up (e.g. what if markdown is 10%?)" />
                        <button className="btn btn-outline" type="submit" disabled={cardLoading[card.id]}>Send</button>
                      </form>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}

        {activeTab === 'changes' && (
          <div className="list-card">
            {changesLoading ? 'Loading…' : changes.map((c) => (
              <div key={c.actionId} className="change-row">
                <strong>{c.agentSource}</strong> — {c.title} ({c.status})
              </div>
            ))}
          </div>
        )}

        {activeTab === 'data-peek' && (
          <div className="list-card">
            {dbPeekLoading || !dbPeek ? 'Loading…' : (
              <div className="table-wrap">
                <table>
                  <thead><tr>{dbPeek.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {dbPeek.rows.map((row, i) => (
                      <tr key={i} className={dbPeek.changedSkus.includes(String(row.sku_id)) ? 'changed' : ''}>
                        {dbPeek.columns.map((c) => <td key={c}>{String(row[c] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {configureAgent && (
        <aside className="config-drawer">
          <div className="drawer-head">
            <h3>Configure {configureAgent}</h3>
            <button className="btn btn-outline" onClick={() => setConfigureAgent(null)}>Close</button>
          </div>
          <p className="muted">Current instructions: {agentConfigs[configureAgent]?.instructions || 'Default behavior'}</p>
          <div className="drawer-chat">
            {(agentConfigs[configureAgent]?.history ?? []).map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
          </div>
          <form onSubmit={saveAgentConfig} className="thread-form">
            <input value={agentInput} onChange={(e) => setAgentInput(e.target.value)} placeholder="Redefine this agent job..." />
            <button className="btn" type="submit" disabled={agentSaving}>Save</button>
          </form>
        </aside>
      )}

      <section className="chat-bar">
        <div className="chat-history">
          {chatHistory.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
          {chatLoading && <div className="msg assistant">Thinking…</div>}
        </div>
        <form onSubmit={submitGlobalChat} className="thread-form">
          <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask your data anything" />
          <button className="btn" type="submit" disabled={chatLoading}>Ask</button>
        </form>
      </section>
    </main>
  )
}
