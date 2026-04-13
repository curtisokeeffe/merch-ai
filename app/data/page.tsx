'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

interface KPIEntry { key: string; label: string; value: string; raw: number }
type Message = { role: 'user' | 'assistant'; content: string }

interface ProductRow {
  sku_id: string; name: string; category: string
  retail_price: number; cost_price: number; markdown_pct: number
  status: string; units_sold: number; sell_through_rate: number
  weeks_of_supply: number; inventory_value: number; current_stock: number
}

export default function DataPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'database' | 'simulate'>('overview')
  const [kpis, setKpis] = useState<KPIEntry[]>([])
  const [products, setProducts] = useState<ProductRow[] | null>(null)
  const [changedSkus, setChangedSkus] = useState<string[]>([])
  const [dbLoading, setDbLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<keyof ProductRow>('category')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [simChat, setSimChat] = useState<Message[]>([])
  const [simInput, setSimInput] = useState('')
  const [simStreaming, setSimStreaming] = useState(false)
  const simBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/kpis').then((r) => r.json()).then((d) => { if (d.kpis) setKpis(d.kpis) })
  }, [])

  useEffect(() => {
    simBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [simChat])

  const loadDb = useCallback(async () => {
    if (products) return
    setDbLoading(true)
    const d = await fetch('/api/db-peek').then((r) => r.json())
    if (d.products) setProducts(d.products)
    if (d.changedSkus) setChangedSkus(d.changedSkus)
    setDbLoading(false)
  }, [products])

  useEffect(() => {
    if (activeTab === 'database') loadDb()
  }, [activeTab, loadDb])

  async function sendSim(text: string) {
    if (!text.trim() || simStreaming) return
    const newMessages: Message[] = [...simChat, { role: 'user', content: text }]
    setSimChat([...newMessages, { role: 'assistant', content: '' }])
    setSimInput('')
    setSimStreaming(true)
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: newMessages }) })
    const reader = res.body!.getReader(); const decoder = new TextDecoder(); let responseText = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      responseText += decoder.decode(value, { stream: true })
      setSimChat((p) => { const msgs = [...p]; msgs[msgs.length - 1] = { role: 'assistant', content: responseText }; return msgs })
    }
    setSimStreaming(false)
  }

  // Derived product data
  const filteredProducts = (products ?? []).filter((p) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return p.sku_id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.status.toLowerCase().includes(q)
  }).sort((a, b) => {
    const va = a[sortField]; const vb = b[sortField]
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(field: keyof ProductRow) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // Category breakdown for overview
  const categories = [...new Set((products ?? []).map((p) => p.category))]
  const catStats = categories.map((cat) => {
    const rows = (products ?? []).filter((p) => p.category === cat)
    const revenue = rows.reduce((s, p) => s + p.inventory_value, 0)
    const avgST = rows.reduce((s, p) => s + p.sell_through_rate, 0) / rows.length
    return { cat, count: rows.length, revenue, avgST }
  }).sort((a, b) => b.revenue - a.revenue)

  const SortIcon = ({ field }: { field: keyof ProductRow }) => (
    <span style={{ marginLeft: 4, color: sortField === field ? '#F59E0B' : '#CBD5E1', fontSize: 10 }}>
      {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  )

  return (
    <div style={{ paddingTop: 56, minHeight: '100vh', background: '#F8FAFC', fontFamily: SANS }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '20px 28px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Data Analysis</h1>
        <p style={{ fontSize: 14, color: '#64748B' }}>Deep-dive into your live product database, run simulations, and explore trends.</p>
      </div>

      {/* Tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '0 28px', display: 'flex' }}>
        {([
          { key: 'overview' as const, label: '📊 Overview' },
          { key: 'database' as const, label: '🗄 Database' },
          { key: 'simulate' as const, label: '🔬 Simulate' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${activeTab === tab.key ? '#F59E0B' : 'transparent'}`, padding: '12px 20px', fontSize: 14, fontWeight: 600, color: activeTab === tab.key ? '#F59E0B' : '#94A3B8', cursor: 'pointer', marginBottom: -1, fontFamily: SANS, transition: 'color 0.15s' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 28px' }}>

        {/* ── Overview ── */}
        {activeTab === 'overview' && (
          <div>
            {/* KPI grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 28 }}>
              {kpis.map((k) => (
                <div key={k.key} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: '#F59E0B' }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Category breakdown */}
            <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', fontSize: 14, fontWeight: 700, color: '#1E293B' }}>Category Breakdown</div>
              {catStats.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                  Switch to the Database tab first to load product data, then come back.
                </div>
              ) : catStats.map((c, i) => {
                const maxRev = catStats[0].revenue
                return (
                  <div key={c.cat}>
                    {i > 0 && <div style={{ height: 1, background: '#F1F5F9' }} />}
                    <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 120, fontSize: 13, fontWeight: 600, color: '#1E293B', flexShrink: 0 }}>{c.cat}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 8, borderRadius: 4, background: '#F1F5F9', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(c.revenue / maxRev) * 100}%`, background: '#F59E0B', borderRadius: 4, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: '#F59E0B', fontWeight: 600, width: 100, textAlign: 'right' }}>
                        ${(c.revenue / 1000).toFixed(0)}k
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B', width: 80, textAlign: 'right' }}>{c.count} SKUs</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, width: 70, textAlign: 'right', color: c.avgST > 70 ? '#22C55E' : c.avgST < 40 ? '#EF4444' : '#64748B', fontWeight: 600 }}>
                        {c.avgST.toFixed(0)}% ST
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Status breakdown */}
            {products && (
              <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Inventory Status</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {[
                    { status: 'active', color: '#22C55E', light: '#F0FDF4', border: '#86EFAC' },
                    { status: 'on_markdown', color: '#EF4444', light: '#FEF2F2', border: '#FCA5A5' },
                    { status: 'loyalty-priced', color: '#8B5CF6', light: '#F5F3FF', border: '#C4B5FD' },
                  ].map(({ status, color, light, border }) => {
                    const count = products.filter((p) => p.status === status).length
                    return (
                      <div key={status} style={{ background: light, border: `1px solid ${border}`, borderRadius: 8, padding: '12px 18px', minWidth: 140 }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: MONO }}>{count}</div>
                        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{status.replace('_', ' ')}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Database ── */}
        {activeTab === 'database' && (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU, name, category, status…"
                style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontFamily: SANS, background: 'white' }}
              />
              <button onClick={() => { setProducts(null); loadDb() }} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontSize: 13, color: '#64748B', cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}>
                ↺ Refresh
              </button>
              {changedSkus.length > 0 && (
                <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 600, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 6, padding: '6px 12px', whiteSpace: 'nowrap' }}>
                  ● {changedSkus.length} modified
                </span>
              )}
            </div>

            {dbLoading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8', fontSize: 14 }}>Loading database…</div>
            ) : !products ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#CBD5E1', fontSize: 14 }}>No data loaded.</div>
            ) : (
              <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: '#1E293B' }}>live_products</span>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>{filteredProducts.length} of {products.length} rows</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        {([
                          { label: 'SKU',        field: 'sku_id'          as keyof ProductRow },
                          { label: 'Name',       field: 'name'            as keyof ProductRow },
                          { label: 'Category',   field: 'category'        as keyof ProductRow },
                          { label: 'Retail $',   field: 'retail_price'    as keyof ProductRow },
                          { label: 'Markdown %', field: 'markdown_pct'    as keyof ProductRow },
                          { label: 'Status',     field: 'status'          as keyof ProductRow },
                          { label: 'Sell-Thru',  field: 'sell_through_rate' as keyof ProductRow },
                          { label: 'WoS',        field: 'weeks_of_supply' as keyof ProductRow },
                          { label: 'Stock',      field: 'current_stock'   as keyof ProductRow },
                        ]).map(({ label, field }) => (
                          <th
                            key={field}
                            onClick={() => toggleSort(field)}
                            style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: sortField === field ? '#F59E0B' : '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                          >
                            {label}<SortIcon field={field} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((p, i) => {
                        const changed = changedSkus.includes(p.sku_id)
                        return (
                          <tr key={p.sku_id} style={{ background: changed ? '#F0FDF4' : i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                            <td style={{ padding: '7px 12px', fontFamily: MONO, fontSize: 11, color: '#64748B', whiteSpace: 'nowrap' }}>{p.sku_id}</td>
                            <td style={{ padding: '7px 12px', color: '#1E293B', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                            <td style={{ padding: '7px 12px', color: '#64748B', whiteSpace: 'nowrap' }}>{p.category}</td>
                            <td style={{ padding: '7px 12px', fontFamily: MONO, color: '#F59E0B', fontWeight: 600, whiteSpace: 'nowrap' }}>${p.retail_price.toFixed(2)}</td>
                            <td style={{ padding: '7px 12px', fontFamily: MONO, color: p.markdown_pct > 0 ? '#EF4444' : '#94A3B8', whiteSpace: 'nowrap' }}>{p.markdown_pct > 0 ? `${p.markdown_pct}%` : '—'}</td>
                            <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: p.status === 'on_markdown' ? '#FEF2F2' : p.status === 'loyalty-priced' ? '#F5F3FF' : '#F0FDF4', color: p.status === 'on_markdown' ? '#EF4444' : p.status === 'loyalty-priced' ? '#8B5CF6' : '#22C55E' }}>
                                {p.status}
                              </span>
                            </td>
                            <td style={{ padding: '7px 12px', fontFamily: MONO, whiteSpace: 'nowrap', color: p.sell_through_rate > 75 ? '#22C55E' : p.sell_through_rate < 30 ? '#EF4444' : '#64748B' }}>{p.sell_through_rate.toFixed(0)}%</td>
                            <td style={{ padding: '7px 12px', fontFamily: MONO, whiteSpace: 'nowrap', color: p.weeks_of_supply > 16 ? '#EF4444' : '#64748B' }}>{p.weeks_of_supply.toFixed(1)}w</td>
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

        {/* ── Simulate ── */}
        {activeTab === 'simulate' && (
          <div style={{ display: 'flex', gap: 20 }}>
            {/* Chat */}
            <div style={{ flex: 1, background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 500 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 2 }}>🔬 Simulation Chat</div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>Ask "what if" questions — Claude uses your live data to model scenarios</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {simChat.length === 0 && (
                  <div style={{ textAlign: 'center', paddingTop: 20 }}>
                    <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16, lineHeight: 1.6 }}>
                      Model hypothetical scenarios against your live inventory.<br />Claude will estimate the impact using real data.
                    </div>
                    {[
                      'What if I marked down all Electronics by 20%?',
                      'What would happen if I raised Beauty prices by 10%?',
                      'How much revenue is at risk from overstocked SKUs?',
                      'Which SKUs would benefit most from a bundle promotion?',
                    ].map((q) => (
                      <button key={q} onClick={() => sendSim(q)} style={{ display: 'block', width: '100%', maxWidth: 440, margin: '0 auto 8px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: '#64748B', cursor: 'pointer', fontFamily: SANS, textAlign: 'left', transition: 'border-color 0.15s' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#F59E0B' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E2E8F0' }}
                      >
                        💡 {q}
                      </button>
                    ))}
                  </div>
                )}
                {simChat.map((msg, i) => (
                  <div key={i} style={{ marginBottom: 14, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {msg.role === 'assistant' && (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#FFFBEB', border: '1px solid #FCD34D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, marginRight: 8, flexShrink: 0, marginTop: 2 }}>🔬</div>
                    )}
                    <div style={{ maxWidth: '80%', background: msg.role === 'user' ? '#1E293B' : '#F8FAFC', border: msg.role === 'assistant' ? '1px solid #E2E8F0' : 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, lineHeight: 1.6, color: msg.role === 'user' ? 'white' : '#1E293B' }}>
                      {msg.content || (simStreaming && i === simChat.length - 1 ? <span style={{ color: '#F59E0B' }}>▍</span> : null)}
                    </div>
                  </div>
                ))}
                <div ref={simBottomRef} />
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 8 }}>
                <input value={simInput} onChange={(e) => setSimInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && simInput.trim() && !simStreaming) { e.preventDefault(); sendSim(simInput) } }} placeholder="What if I changed…" disabled={simStreaming} style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontFamily: SANS }} />
                <button onClick={() => sendSim(simInput)} disabled={simStreaming || !simInput.trim()} style={{ background: simStreaming || !simInput.trim() ? '#F1F5F9' : '#F59E0B', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: simStreaming || !simInput.trim() ? '#94A3B8' : 'white', cursor: simStreaming || !simInput.trim() ? 'not-allowed' : 'pointer', fontFamily: SANS }}>Run →</button>
                {simChat.length > 0 && (
                  <button onClick={() => setSimChat([])} style={{ background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#94A3B8', cursor: 'pointer', fontFamily: SANS }}>✕</button>
                )}
              </div>
            </div>

            {/* Sidebar tips */}
            <div style={{ width: 240, flexShrink: 0 }}>
              <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>How it works</div>
                {['Claude reads your live database before every response', 'Scenarios are modelled — no real changes are made', 'Go to Agents to approve actual mutations', 'Use Changes to review what\'s already been applied'].map((tip, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span style={{ color: '#F59E0B', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>{tip}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '14px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 6 }}>💡 Pro tip</div>
                <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
                  Load the Database tab first so Claude has context on current stock levels and pricing when you run simulations.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
