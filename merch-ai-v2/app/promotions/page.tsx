'use client'

import { useState, useEffect, useCallback } from 'react'

interface MarkdownRec {
  id: string
  sku_id: string
  product_name: string
  category: string
  current_price: number
  recommended_price: number
  discount_pct: number
  urgency_score: number
  weeks_remaining: number
  projected_sell_through: number
  projected_margin_impact: string
  reasoning: string
  bundle_candidate: number
  status: string
  created_at: string
}

interface PromotionScenario {
  id: string
  name: string
  sku_ids: string
  discount_pct: number
  projected_revenue: number
  projected_units: number
  projected_margin_pct: number
  scenario_notes: string
  created_at: string
}

interface SimulationResult {
  projected_revenue: number
  projected_units: number
  projected_margin_pct: number
  reasoning: string
}

interface ProductOption {
  sku_id: string
  name: string
  category: string
  retail_price: number
}

function UrgencyPill({ score }: { score: number }) {
  const label = score >= 0.8 ? 'Urgent' : score >= 0.5 ? 'Moderate' : 'Low'
  const color = score >= 0.8 ? '#EF4444' : score >= 0.5 ? '#F59E0B' : '#10B981'
  const bg = score >= 0.8 ? 'rgba(239,68,68,0.1)' : score >= 0.5 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{(score * 100).toFixed(0)}</span>
      <span style={{ fontSize: 10, color, background: bg, padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
        {label}
      </span>
    </div>
  )
}

export default function PromotionsPage() {
  const [recs, setRecs] = useState<MarkdownRec[]>([])
  const [scenarios, setScenarios] = useState<PromotionScenario[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'markdowns' | 'simulator'>('markdowns')
  const [actioningId, setActioningId] = useState<string | null>(null)

  // Simulator state
  const [selectedSkus, setSelectedSkus] = useState<string[]>([])
  const [discountPct, setDiscountPct] = useState(20)
  const [simulating, setSimulating] = useState(false)
  const [simResult, setSimResult] = useState<SimulationResult | null>(null)
  const [simError, setSimError] = useState<string | null>(null)
  const [savingScenario, setSavingScenario] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/promotions')
      const json = await res.json()
      setRecs(json.recommendations ?? [])
      setScenarios(json.scenarios ?? [])
      setProducts(json.products ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'schedule') => {
    setActioningId(id)
    try {
      await fetch('/api/promotions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      await fetchData()
    } finally {
      setActioningId(null)
    }
  }

  const handleSimulate = async () => {
    if (selectedSkus.length === 0) return
    setSimulating(true)
    setSimResult(null)
    setSimError(null)
    try {
      const res = await fetch('/api/promotions/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku_ids: selectedSkus, discount_pct: discountPct }),
      })
      const json = await res.json()
      if (json.error) {
        setSimError(json.error)
      } else {
        setSimResult(json)
        await fetchData()
      }
    } catch (err) {
      setSimError(String(err))
    } finally {
      setSimulating(false)
    }
  }

  const toggleSku = (skuId: string) => {
    setSelectedSkus((prev) =>
      prev.includes(skuId) ? prev.filter((s) => s !== skuId) : [...prev, skuId]
    )
  }

  const pendingCount = recs.filter((r) => r.status === 'pending').length
  const avgUrgency = recs.length > 0
    ? recs.reduce((s, r) => s + r.urgency_score, 0) / recs.length
    : 0
  const estRevRecovery = recs
    .filter((r) => r.status === 'pending')
    .reduce((s, r) => {
      const match = r.projected_margin_impact.match(/[+-]?\$?([\d,]+)/)
      return s + (match ? parseFloat(match[1].replace(',', '')) : 0)
    }, 0)

  const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
    pending:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
    approved:  { color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
    rejected:  { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
    scheduled: { color: '#6366F1', bg: 'rgba(99,102,241,0.1)' },
  }

  return (
    <div>
      {/* Top bar */}
      <div style={{
        height: 56, background: '#FFFFFF', borderBottom: '1px solid #E2E8F0',
        display: 'flex', alignItems: 'center', padding: '0 32px',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: '#0F172A' }}>Markdowns & Promos</h1>
          <div style={{ fontSize: 12, color: '#64748B' }}>Urgency-driven markdown timing and scenario simulation</div>
        </div>
      </div>

      <div style={{ padding: '0 32px 32px' }}>
        {/* KPIs */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
          marginTop: 24, marginBottom: 24,
        }}>
          {[
            { label: 'Recommendations Pending', value: pendingCount, color: '#6366F1', icon: '🏷' },
            { label: 'Avg Urgency Score', value: (avgUrgency * 100).toFixed(0), color: '#F59E0B', icon: '⏰' },
            { label: 'Est. Revenue Recovery', value: `$${estRevRecovery.toLocaleString()}`, color: '#10B981', icon: '💵' },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
              padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <span style={{ fontSize: 28 }}>{kpi.icon}</span>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{kpi.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0',
          borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden',
        }}>
          <div style={{ padding: '0 20px', borderBottom: '1px solid #E2E8F0', display: 'flex' }}>
            {(['markdowns', 'simulator'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '13px 16px', background: 'transparent', border: 'none',
                  borderBottom: activeTab === tab ? '2px solid #6366F1' : '2px solid transparent',
                  color: activeTab === tab ? '#6366F1' : '#64748B',
                  fontWeight: activeTab === tab ? 600 : 400,
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                {tab === 'markdowns' ? `Markdown Recommendations (${recs.length})` : 'Scenario Simulator'}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>Loading...</div>
          ) : activeTab === 'markdowns' ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    {['SKU', 'Product', 'Current', 'Recommended', 'Discount', 'Urgency', 'Weeks Left', 'Proj. ST', 'Impact', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={{
                        padding: '10px 14px', textAlign: 'left',
                        fontSize: 11, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recs.map((rec) => {
                    const isActioning = actioningId === rec.id
                    const sc = STATUS_COLORS[rec.status] ?? STATUS_COLORS.pending
                    return (
                      <tr key={rec.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6366F1', fontWeight: 600 }}>
                            {rec.sku_id}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', maxWidth: 170 }}>
                          <div style={{ fontWeight: 500, color: '#0F172A', fontSize: 12 }}>{rec.product_name}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>{rec.category}</div>
                          {rec.bundle_candidate === 1 && (
                            <span style={{
                              fontSize: 10, color: '#8B5CF6', background: 'rgba(139,92,246,0.1)',
                              padding: '1px 5px', borderRadius: 4, marginTop: 2, display: 'inline-block',
                            }}>Bundle candidate</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#475569' }}>${rec.current_price}</td>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F172A' }}>${rec.recommended_price}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontWeight: 700, color: '#EF4444', fontSize: 13 }}>
                            -{rec.discount_pct}%
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <UrgencyPill score={rec.urgency_score} />
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: rec.weeks_remaining <= 4 ? '#EF4444' : '#0F172A' }}>
                          {rec.weeks_remaining}w
                        </td>
                        <td style={{ padding: '12px 14px', color: '#475569' }}>
                          {rec.projected_sell_through.toFixed(0)}%
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontWeight: 600, color: '#10B981' }}>{rec.projected_margin_impact}</span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 20, fontSize: 11,
                            fontWeight: 600, color: sc.color, background: sc.bg,
                          }}>{rec.status}</span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {rec.status === 'pending' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  onClick={() => handleAction(rec.id, 'approve')}
                                  disabled={isActioning}
                                  style={{
                                    background: '#10B981', color: '#fff', border: 'none',
                                    borderRadius: 5, padding: '4px 9px', fontSize: 11,
                                    fontWeight: 600, cursor: isActioning ? 'not-allowed' : 'pointer',
                                    opacity: isActioning ? 0.6 : 1,
                                  }}
                                >Approve</button>
                                <button
                                  onClick={() => handleAction(rec.id, 'schedule')}
                                  disabled={isActioning}
                                  style={{
                                    background: '#EEF2FF', color: '#6366F1', border: 'none',
                                    borderRadius: 5, padding: '4px 9px', fontSize: 11,
                                    fontWeight: 600, cursor: isActioning ? 'not-allowed' : 'pointer',
                                    opacity: isActioning ? 0.6 : 1,
                                  }}
                                >Schedule</button>
                              </div>
                              <button
                                onClick={() => handleAction(rec.id, 'reject')}
                                disabled={isActioning}
                                style={{
                                  background: 'transparent', color: '#EF4444',
                                  border: '1px solid #FCA5A5', borderRadius: 5,
                                  padding: '3px 8px', fontSize: 11, fontWeight: 600,
                                  cursor: isActioning ? 'not-allowed' : 'pointer',
                                  opacity: isActioning ? 0.6 : 1,
                                }}
                              >Reject</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {recs.length === 0 && (
                    <tr>
                      <td colSpan={11} style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                        No markdown recommendations at this time.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            // Scenario Simulator
            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', minHeight: 480 }}>
              {/* Left: inputs */}
              <div style={{
                borderRight: '1px solid #E2E8F0', padding: 24,
                display: 'flex', flexDirection: 'column', gap: 20,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 12 }}>Select SKUs</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {products.map((p) => (
                      <label key={p.sku_id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedSkus.includes(p.sku_id)}
                          onChange={() => toggleSku(p.sku_id)}
                          style={{ width: 14, height: 14, accentColor: '#6366F1', flexShrink: 0 }}
                        />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#0F172A' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>
                            {p.sku_id} · ${p.retail_price} · {p.category}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedSkus.length > 0 && (
                    <div style={{ fontSize: 11, color: '#6366F1', marginTop: 8, fontWeight: 600 }}>
                      {selectedSkus.length} SKU{selectedSkus.length > 1 ? 's' : ''} selected
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>
                    Discount Depth: <span style={{ color: '#6366F1' }}>{discountPct}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={discountPct}
                    onChange={(e) => setDiscountPct(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: '#6366F1' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94A3B8' }}>
                    <span>5%</span><span>50%</span>
                  </div>
                </div>

                <button
                  onClick={handleSimulate}
                  disabled={simulating || selectedSkus.length === 0}
                  style={{
                    background: simulating || selectedSkus.length === 0 ? '#94A3B8' : '#6366F1',
                    color: '#fff', border: 'none', borderRadius: 8,
                    padding: '10px 16px', fontSize: 13, fontWeight: 600,
                    cursor: (simulating || selectedSkus.length === 0) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {simulating ? '⏳ Simulating...' : '▶ Run Simulation'}
                </button>
              </div>

              {/* Right: results */}
              <div style={{ padding: 24 }}>
                {simResult ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      {[
                        { label: 'Projected Revenue', value: `$${simResult.projected_revenue.toLocaleString()}`, color: '#10B981' },
                        { label: 'Projected Units', value: simResult.projected_units.toString(), color: '#6366F1' },
                        { label: 'Projected Margin', value: `${simResult.projected_margin_pct.toFixed(1)}%`, color: '#F59E0B' },
                      ].map((m) => (
                        <div key={m.label} style={{
                          background: '#F8FAFC', borderRadius: 10, padding: 16, textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: m.color, marginBottom: 4 }}>{m.value}</div>
                          <div style={{ fontSize: 11, color: '#64748B' }}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{
                      padding: '14px 18px', background: 'rgba(99,102,241,0.04)',
                      borderLeft: '3px solid #6366F1', borderRadius: '0 8px 8px 0',
                      fontSize: 13, color: '#475569', lineHeight: 1.7,
                    }}>
                      {simResult.reasoning}
                    </div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>
                      ✓ Scenario saved to history below
                    </div>
                  </div>
                ) : simError ? (
                  <div style={{ color: '#EF4444', fontSize: 13 }}>Error: {simError}</div>
                ) : (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: '100%', color: '#94A3B8', gap: 8,
                  }}>
                    <span style={{ fontSize: 40 }}>📊</span>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>Select SKUs and click Run Simulation</div>
                    <div style={{ fontSize: 12 }}>Claude will project revenue, units, and margin impact</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Saved scenarios */}
        {scenarios.length > 0 && (
          <div style={{
            marginTop: 24, background: '#FFFFFF', border: '1px solid #E2E8F0',
            borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Saved Scenarios</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
              {scenarios.map((s) => (
                <div key={s.id} style={{ padding: 18, borderBottom: '1px solid #F1F5F9', borderRight: '1px solid #F1F5F9' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A', marginBottom: 6 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>
                    {JSON.parse(s.sku_ids).length} SKUs · {s.discount_pct}% discount
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>Revenue</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#10B981' }}>${s.projected_revenue.toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>Margin</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>{s.projected_margin_pct.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>Units</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#6366F1' }}>{s.projected_units}</div>
                    </div>
                  </div>
                  {s.scenario_notes && (
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 8, lineHeight: 1.5, borderTop: '1px solid #F1F5F9', paddingTop: 8 }}>
                      {s.scenario_notes.length > 120 ? s.scenario_notes.slice(0, 120) + '...' : s.scenario_notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
