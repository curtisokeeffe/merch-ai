'use client'

import { useState, useEffect, useCallback } from 'react'

interface PricingRec {
  id: string
  sku_id: string
  product_name: string
  category: string
  current_price: number
  recommended_price: number
  change_pct: number
  confidence: number
  elasticity: number
  reasoning: string
  projected_sell_through: number
  projected_margin_impact: string
  status: string
  created_at: string
}

interface Guardrail {
  sku_id: string
  min_price: number
  max_price: number
  max_change_pct: number
  floor_margin_pct: number
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? '#10B981' : pct >= 60 ? '#F59E0B' : '#EF4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        flex: 1, height: 4, background: '#E2E8F0', borderRadius: 2, overflow: 'hidden', minWidth: 60,
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color: '#64748B', minWidth: 28 }}>{pct}%</span>
    </div>
  )
}

export default function PricingPage() {
  const [recs, setRecs] = useState<PricingRec[]>([])
  const [guardrails, setGuardrails] = useState<Guardrail[]>([])
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [showGuardrails, setShowGuardrails] = useState(false)
  const [editingGuardrail, setEditingGuardrail] = useState<Guardrail | null>(null)
  const [savingGuardrail, setSavingGuardrail] = useState(false)
  const [expandedReasoning, setExpandedReasoning] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/pricing')
      const json = await res.json()
      setRecs(json.recommendations ?? [])
      setGuardrails(json.guardrails ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActioningId(id)
    try {
      await fetch('/api/pricing/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      await fetchData()
    } finally {
      setActioningId(null)
    }
  }

  const handleSaveGuardrail = async () => {
    if (!editingGuardrail) return
    setSavingGuardrail(true)
    try {
      await fetch('/api/pricing/guardrails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingGuardrail),
      })
      await fetchData()
      setEditingGuardrail(null)
    } finally {
      setSavingGuardrail(false)
    }
  }

  const pendingCount = recs.filter((r) => r.status === 'pending').length
  const totalMarginOpportunity = recs
    .filter((r) => r.status === 'pending')
    .reduce((sum, r) => {
      const match = r.projected_margin_impact.match(/[+-]?\$?([\d,]+)/)
      if (match) return sum + parseFloat(match[1].replace(',', ''))
      return sum
    }, 0)

  return (
    <div>
      {/* Top bar */}
      <div style={{
        height: 56, background: '#FFFFFF', borderBottom: '1px solid #E2E8F0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: '#0F172A' }}>Dynamic Pricing</h1>
          <div style={{ fontSize: 12, color: '#64748B' }}>
            Elasticity-based recommendations with guardrail-aware execution
          </div>
        </div>
        <button
          onClick={() => setShowGuardrails(!showGuardrails)}
          style={{
            background: showGuardrails ? '#EEF2FF' : 'transparent',
            color: '#6366F1', border: '1px solid #6366F1',
            borderRadius: 8, padding: '7px 14px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ⚙ {showGuardrails ? 'Hide' : 'Show'} Guardrails
        </button>
      </div>

      <div style={{ padding: '0 32px 32px' }}>
        {/* KPI row */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
          marginTop: 24, marginBottom: 24,
        }}>
          {[
            { label: 'Recommendations Pending', value: pendingCount, color: '#6366F1', icon: '💲' },
            {
              label: 'Total Margin Opportunity',
              value: `+$${totalMarginOpportunity.toLocaleString()}`,
              color: '#10B981',
              icon: '📈',
            },
            { label: 'Guardrails Active', value: guardrails.length, color: '#F59E0B', icon: '🛡' },
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

        {/* Recommendations table */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0',
          borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          marginBottom: 24, overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Pricing Recommendations</h2>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              Review and approve price changes. All changes respect per-SKU guardrails.
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>Loading recommendations...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    {['SKU', 'Product', 'Current', 'Recommended', 'Change', 'Confidence', 'Sell-Through', 'Margin Impact', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={{
                        padding: '10px 14px', textAlign: 'left', fontSize: 11,
                        fontWeight: 600, color: '#475569', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recs.map((rec) => {
                    const isActioning = actioningId === rec.id
                    const changePct = rec.change_pct
                    const changeColor = changePct > 0 ? '#10B981' : changePct < 0 ? '#EF4444' : '#64748B'
                    const statusColors: Record<string, { color: string; bg: string }> = {
                      pending:  { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
                      approved: { color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
                      rejected: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
                    }
                    const sc = statusColors[rec.status] ?? statusColors.pending

                    return (
                      <tr key={rec.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: 11, color: '#6366F1', fontWeight: 600,
                          }}>{rec.sku_id}</span>
                        </td>
                        <td style={{ padding: '12px 14px', maxWidth: 180 }}>
                          <div style={{ fontWeight: 500, color: '#0F172A', fontSize: 12 }}>{rec.product_name}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>{rec.category}</div>
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 500, color: '#475569' }}>
                          ${rec.current_price.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F172A' }}>
                          ${rec.recommended_price.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontWeight: 700, color: changeColor, fontSize: 13 }}>
                            {changePct > 0 ? '+' : ''}{changePct.toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', minWidth: 120 }}>
                          <ConfidenceBar value={rec.confidence} />
                        </td>
                        <td style={{ padding: '12px 14px', color: '#475569' }}>
                          {rec.projected_sell_through.toFixed(0)}%
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontWeight: 600, color: rec.projected_margin_impact.startsWith('+') ? '#10B981' : '#EF4444' }}>
                            {rec.projected_margin_impact}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 20, fontSize: 11,
                            fontWeight: 600, color: sc.color, background: sc.bg,
                          }}>
                            {rec.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {rec.status === 'pending' && (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  onClick={() => handleAction(rec.id, 'approve')}
                                  disabled={isActioning}
                                  style={{
                                    background: '#10B981', color: '#fff', border: 'none',
                                    borderRadius: 5, padding: '4px 10px', fontSize: 11,
                                    fontWeight: 600, cursor: isActioning ? 'not-allowed' : 'pointer',
                                    opacity: isActioning ? 0.6 : 1,
                                  }}
                                >Approve</button>
                                <button
                                  onClick={() => handleAction(rec.id, 'reject')}
                                  disabled={isActioning}
                                  style={{
                                    background: 'transparent', color: '#EF4444',
                                    border: '1px solid #FCA5A5', borderRadius: 5,
                                    padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                    cursor: isActioning ? 'not-allowed' : 'pointer',
                                    opacity: isActioning ? 0.6 : 1,
                                  }}
                                >Reject</button>
                              </div>
                            )}
                            <button
                              onClick={() => setExpandedReasoning(expandedReasoning === rec.id ? null : rec.id)}
                              style={{
                                background: 'transparent', color: '#6366F1', border: 'none',
                                fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: 0,
                                fontWeight: 500,
                              }}
                            >
                              {expandedReasoning === rec.id ? '▲ Hide' : '▼ Reasoning'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {recs.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                  No pricing recommendations at this time.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Inline reasoning panels */}
        {expandedReasoning && (() => {
          const rec = recs.find((r) => r.id === expandedReasoning)
          if (!rec) return null
          return (
            <div style={{
              background: '#FFFFFF', border: '1px solid #E2E8F0',
              borderRadius: 12, padding: 20, marginBottom: 24,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>
                Reasoning — {rec.product_name}
              </div>
              <div style={{
                padding: '12px 16px', background: '#F8FAFC',
                borderLeft: '3px solid #6366F1', borderRadius: '0 8px 8px 0',
                fontSize: 13, color: '#475569', lineHeight: 1.7,
              }}>
                {rec.reasoning}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#94A3B8' }}>
                Elasticity assumption: {rec.elasticity.toFixed(2)} · Model: heuristic baseline
              </div>
            </div>
          )
        })()}

        {/* Guardrails section */}
        {showGuardrails && (
          <div style={{
            background: '#FFFFFF', border: '1px solid #E2E8F0',
            borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}>
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid #E2E8F0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Pricing Guardrails</h2>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  Hard constraints applied before any price change executes
                </div>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    {['SKU', 'Min Price', 'Max Price', 'Max Change %', 'Floor Margin %', ''].map((h) => (
                      <th key={h} style={{
                        padding: '9px 14px', textAlign: 'left',
                        fontSize: 11, fontWeight: 600, color: '#475569',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {guardrails.map((g) => (
                    <tr key={g.sku_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      {editingGuardrail?.sku_id === g.sku_id ? (
                        <>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6366F1', fontWeight: 600 }}>
                              {g.sku_id}
                            </span>
                          </td>
                          {(['min_price', 'max_price', 'max_change_pct', 'floor_margin_pct'] as const).map((field) => (
                            <td key={field} style={{ padding: '8px 14px' }}>
                              <input
                                type="number"
                                value={editingGuardrail[field]}
                                onChange={(e) => setEditingGuardrail({ ...editingGuardrail, [field]: parseFloat(e.target.value) })}
                                style={{
                                  width: 70, padding: '5px 8px', border: '1px solid #6366F1',
                                  borderRadius: 6, fontSize: 12, outline: 'none',
                                }}
                              />
                            </td>
                          ))}
                          <td style={{ padding: '8px 14px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={handleSaveGuardrail}
                                disabled={savingGuardrail}
                                style={{
                                  background: '#6366F1', color: '#fff', border: 'none',
                                  borderRadius: 5, padding: '4px 10px', fontSize: 11,
                                  fontWeight: 600, cursor: savingGuardrail ? 'not-allowed' : 'pointer',
                                }}
                              >Save</button>
                              <button
                                onClick={() => setEditingGuardrail(null)}
                                style={{
                                  background: 'transparent', color: '#64748B',
                                  border: '1px solid #E2E8F0', borderRadius: 5,
                                  padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                                }}
                              >Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6366F1', fontWeight: 600 }}>
                              {g.sku_id}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', color: '#0F172A' }}>${g.min_price}</td>
                          <td style={{ padding: '10px 14px', color: '#0F172A' }}>${g.max_price}</td>
                          <td style={{ padding: '10px 14px', color: '#0F172A' }}>{g.max_change_pct}%</td>
                          <td style={{ padding: '10px 14px', color: '#0F172A' }}>{g.floor_margin_pct}%</td>
                          <td style={{ padding: '10px 14px' }}>
                            <button
                              onClick={() => setEditingGuardrail({ ...g })}
                              style={{
                                background: 'transparent', color: '#6366F1', border: '1px solid #E2E8F0',
                                borderRadius: 5, padding: '4px 10px', fontSize: 11,
                                fontWeight: 500, cursor: 'pointer',
                              }}
                            >Edit</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
