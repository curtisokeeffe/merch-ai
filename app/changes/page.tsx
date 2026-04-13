'use client'

import { useEffect, useState } from 'react'

const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

const AGENT_DEFS = [
  { name: 'Markdown Agent',   color: '#EF4444', light: '#FEF2F2', border: '#FCA5A5' },
  { name: 'Pricing Agent',    color: '#F59E0B', light: '#FFFBEB', border: '#FCD34D' },
  { name: 'Assortment Agent', color: '#22C55E', light: '#F0FDF4', border: '#86EFAC' },
  { name: 'Risk Agent',       color: '#8B5CF6', light: '#F5F3FF', border: '#C4B5FD' },
]
function agentDef(name: string) { return AGENT_DEFS.find((a) => a.name === name) ?? AGENT_DEFS[1] }

interface ChangeEntry {
  actionId: string
  agentSource: string
  title: string
  status: string
  approvedAt: string | null
  mutations: { sku_id: string; field: string; before: unknown; after: unknown }[]
  affectedSkus: string[]
}

export default function ChangesPage() {
  const [changes, setChanges] = useState<ChangeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterAgent, setFilterAgent] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [redeploying, setRedeploying] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/changes').then((r) => r.json()).then((data) => {
      if (data.changes) setChanges(data.changes)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = changes.filter((c) => {
    if (filterAgent !== 'all' && c.agentSource !== filterAgent) return false
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    return true
  })

  const approvedCount = changes.filter((c) => c.status === 'approved').length
  const dismissedCount = changes.filter((c) => c.status === 'dismissed').length

  // Estimate total price impact from mutations
  const priceImpact = changes
    .filter((c) => c.status === 'approved')
    .flatMap((c) => c.mutations)
    .filter((m) => m.field === 'retail_price' && typeof m.before === 'number' && typeof m.after === 'number')
    .reduce((sum, m) => sum + ((m.after as number) - (m.before as number)), 0)

  return (
    <div style={{ paddingTop: 56, minHeight: '100vh', background: '#F8FAFC', fontFamily: SANS }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '20px 28px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Changes</h1>
        <p style={{ fontSize: 14, color: '#64748B' }}>History of all agent actions, mutations applied, and their business impact.</p>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px' }}>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Actions', value: changes.length.toString(), color: '#1E293B' },
            { label: 'Approved', value: approvedCount.toString(), color: '#22C55E' },
            { label: 'Dismissed', value: dismissedCount.toString(), color: '#94A3B8' },
            { label: 'Price Delta', value: `${priceImpact >= 0 ? '+' : ''}$${Math.abs(priceImpact).toFixed(0)}`, color: priceImpact >= 0 ? '#22C55E' : '#EF4444' },
          ].map((s) => (
            <div key={s.label} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>Filter:</span>
          <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: '#1E293B', fontFamily: SANS, background: 'white' }}>
            <option value="all">All Agents</option>
            {AGENT_DEFS.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: '#1E293B', fontFamily: SANS, background: 'white' }}>
            <option value="all">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 'auto' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Changes list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8', fontSize: 14 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 15, color: '#CBD5E1', marginBottom: 6 }}>No changes yet</div>
            <div style={{ fontSize: 13, color: '#E2E8F0' }}>Approve signals from the Agents page to see history here.</div>
          </div>
        ) : (
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
            {filtered.map((entry, ei) => {
              const agent = agentDef(entry.agentSource)
              const isExpanded = expanded === entry.actionId
              const priceMutations = entry.mutations.filter((m) => m.field === 'retail_price' && typeof m.before === 'number' && typeof m.after === 'number')
              const totalDelta = priceMutations.reduce((sum, m) => sum + ((m.after as number) - (m.before as number)), 0)

              return (
                <div key={entry.actionId}>
                  {ei > 0 && <div style={{ height: 1, background: '#F1F5F9' }} />}
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      {/* Timeline dot */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 3, flexShrink: 0 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: entry.status === 'approved' ? '#22C55E' : '#CBD5E1', border: '2px solid white', boxShadow: '0 0 0 2px ' + (entry.status === 'approved' ? '#86EFAC' : '#E2E8F0') }} />
                        {ei < filtered.length - 1 && <div style={{ width: 1, height: 40, background: '#E2E8F0', marginTop: 4 }} />}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: agent.color, background: agent.light, border: `1px solid ${agent.border}`, padding: '2px 8px', borderRadius: 4 }}>
                                {entry.agentSource}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: entry.status === 'approved' ? '#F0FDF4' : '#F8FAFC', color: entry.status === 'approved' ? '#22C55E' : '#94A3B8', border: `1px solid ${entry.status === 'approved' ? '#86EFAC' : '#E2E8F0'}` }}>
                                {entry.status}
                              </span>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{entry.title}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: MONO, fontSize: 11, color: '#94A3B8' }}>
                              {entry.approvedAt ? new Date(entry.approvedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </div>
                            {priceMutations.length > 0 && (
                              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: totalDelta < 0 ? '#EF4444' : '#22C55E', marginTop: 2 }}>
                                {totalDelta >= 0 ? '+' : ''}${totalDelta.toFixed(0)} price delta
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: '#94A3B8' }}>{entry.mutations.length} mutation{entry.mutations.length !== 1 ? 's' : ''}</span>
                          <span style={{ color: '#E2E8F0' }}>·</span>
                          <span style={{ fontSize: 11, color: '#94A3B8' }}>{entry.affectedSkus.length} SKU{entry.affectedSkus.length !== 1 ? 's' : ''}</span>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button
                            onClick={() => setExpanded(isExpanded ? null : entry.actionId)}
                            style={{ background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: '#64748B', cursor: 'pointer', fontFamily: SANS }}
                          >
                            {isExpanded ? 'Hide details' : 'View details'}
                          </button>
                          {entry.status === 'approved' && (
                            <button
                              onClick={async () => {
                                setRedeploying(entry.actionId)
                                // Re-dismiss then prompt user — for demo just log
                                await new Promise((r) => setTimeout(r, 800))
                                setRedeploying(null)
                                alert('Redeploy: This would re-apply the same mutations. Visit Agents to approve fresh signals.')
                              }}
                              disabled={redeploying === entry.actionId}
                              style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: '#F59E0B', fontWeight: 600, cursor: 'pointer', fontFamily: SANS }}
                            >
                              {redeploying === entry.actionId ? 'Processing…' : '↺ Redeploy'}
                            </button>
                          )}
                        </div>

                        {/* Expanded mutations */}
                        {isExpanded && (
                          <div style={{ marginTop: 12, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Mutations Applied</div>
                            {entry.mutations.map((m, mi) => (
                              <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, fontSize: 13 }}>
                                <span style={{ fontFamily: MONO, fontSize: 11, color: '#94A3B8', width: 90, flexShrink: 0 }}>{m.sku_id}</span>
                                <span style={{ color: '#64748B', minWidth: 100 }}>{m.field.replace(/_/g, ' ')}</span>
                                <span style={{ fontFamily: MONO, color: '#94A3B8' }}>{typeof m.before === 'number' ? m.before.toFixed(2) : String(m.before)}</span>
                                <span style={{ color: '#CBD5E1' }}>→</span>
                                <span style={{ fontFamily: MONO, color: m.field.includes('price') ? '#F59E0B' : '#1E293B', fontWeight: 600 }}>
                                  {typeof m.after === 'number' ? m.after.toFixed(2) : String(m.after)}
                                </span>
                                {typeof m.before === 'number' && typeof m.after === 'number' && m.field.includes('price') && (
                                  <span style={{ fontFamily: MONO, fontSize: 11, color: (m.after as number) < (m.before as number) ? '#EF4444' : '#22C55E' }}>
                                    ({(m.after as number) < (m.before as number) ? '' : '+'}{((((m.after as number) - (m.before as number)) / (m.before as number)) * 100).toFixed(1)}%)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
