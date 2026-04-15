'use client'

import { useState, useEffect, useCallback } from 'react'

interface ActionItem {
  id: string
  module: string
  type: string
  title: string
  description: string
  impact: string
  confidence: number
  severity: string
  status: string
  created_at: string
}

interface Signal {
  id: string
  signal_type: string
  title: string
  description: string
  severity: string
  source: string
  detected_at: string
}

interface Brief {
  id: string
  generated_at: string
  summary: string
  signal_count: number
  critical_count: number
}

interface DashboardData {
  pendingActions: number
  criticalSignals: number
  avgConfidence: number
  actions: ActionItem[]
  latestBrief: Brief | null
  topSignals: Signal[]
}

const MODULE_COLORS: Record<string, string> = {
  pricing: '#6366F1',
  performance: '#3B82F6',
  content: '#10B981',
  forecasting: '#F59E0B',
  promotions: '#EF4444',
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#EF4444',
  high: '#F59E0B',
  medium: '#6366F1',
  low: '#10B981',
}

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      color,
      background: bg,
      textTransform: 'capitalize',
    }}>
      {text}
    </span>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? '#10B981' : pct >= 60 ? '#F59E0B' : '#EF4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1,
        height: 4,
        background: '#E2E8F0',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <span style={{ fontSize: 11, color: '#64748B', minWidth: 30 }}>{pct}%</span>
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingBrief, setGeneratingBrief] = useState(false)
  const [actioningId, setActioningId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard')
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Failed to fetch dashboard data', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleGenerateBrief = async () => {
    setGeneratingBrief(true)
    try {
      await fetch('/api/performance/run', { method: 'POST' })
      await fetchData()
    } catch (err) {
      console.error(err)
    } finally {
      setGeneratingBrief(false)
    }
  }

  const handleAction = async (id: string, action: 'approve' | 'dismiss') => {
    setActioningId(id)
    try {
      await fetch('/api/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      await fetchData()
    } catch (err) {
      console.error(err)
    } finally {
      setActioningId(null)
    }
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })

  if (loading) {
    return (
      <div style={{ padding: '40px 32px' }}>
        <div style={{ color: '#64748B', fontSize: 14 }}>Loading dashboard...</div>
      </div>
    )
  }

  const kpis = [
    {
      label: 'Pending Actions',
      value: data?.pendingActions ?? 0,
      sub: 'across all modules',
      color: '#6366F1',
      icon: '⚡',
    },
    {
      label: 'Critical Signals',
      value: data?.criticalSignals ?? 0,
      sub: 'require immediate attention',
      color: '#EF4444',
      icon: '🚨',
    },
    {
      label: 'Avg Confidence',
      value: `${Math.round((data?.avgConfidence ?? 0) * 100)}%`,
      sub: 'across pending recommendations',
      color: '#10B981',
      icon: '🎯',
    },
    {
      label: 'Revenue At Risk',
      value: '$42,800',
      sub: 'from critical overstock items',
      color: '#F59E0B',
      icon: '⚠️',
    },
  ]

  return (
    <div>
      {/* Top bar */}
      <div style={{
        height: 56,
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: '#0F172A' }}>Command Center</h1>
          <div style={{ fontSize: 12, color: '#64748B' }}>{today}</div>
        </div>
        <button
          onClick={handleGenerateBrief}
          disabled={generatingBrief}
          style={{
            background: generatingBrief ? '#94A3B8' : '#6366F1',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: generatingBrief ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {generatingBrief ? '⏳ Generating...' : '✨ Generate Daily Brief'}
        </button>
      </div>

      <div style={{ padding: '0 32px 32px' }}>
        {/* KPI Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginTop: 24,
          marginBottom: 24,
        }}>
          {kpis.map((kpi) => (
            <div key={kpi.label} style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 12,
              padding: 24,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#64748B' }}>{kpi.label}</div>
                <span style={{ fontSize: 20 }}>{kpi.icon}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color, marginBottom: 4 }}>
                {kpi.value}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Main content: 60/40 split */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 24 }}>
          {/* Left: Action Queue */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Action Queue</h2>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  {data?.actions?.length ?? 0} pending — sorted by severity
                </div>
              </div>
              <Badge text={`${data?.pendingActions ?? 0} pending`} color="#6366F1" bg="rgba(99,102,241,0.1)" />
            </div>
            <div style={{ padding: '4px 0' }}>
              {(data?.actions ?? []).map((action) => (
                <div key={action.id} style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid #F1F5F9',
                  transition: 'background 0.15s ease',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge
                        text={action.module}
                        color={MODULE_COLORS[action.module] ?? '#64748B'}
                        bg={`${MODULE_COLORS[action.module] ?? '#64748B'}1A`}
                      />
                      <Badge
                        text={action.severity}
                        color={SEVERITY_COLORS[action.severity] ?? '#64748B'}
                        bg={`${SEVERITY_COLORS[action.severity] ?? '#64748B'}1A`}
                      />
                    </div>
                    <span style={{
                      fontSize: 11,
                      color: '#10B981',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      marginLeft: 8,
                    }}>
                      {action.impact}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A', marginBottom: 4 }}>
                    {action.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10, lineHeight: 1.5 }}>
                    {action.description}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <ConfidenceBar value={action.confidence} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleAction(action.id, 'approve')}
                      disabled={actioningId === action.id}
                      style={{
                        background: '#10B981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: actioningId === action.id ? 0.6 : 1,
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(action.id, 'dismiss')}
                      disabled={actioningId === action.id}
                      style={{
                        background: 'transparent',
                        color: '#64748B',
                        border: '1px solid #E2E8F0',
                        borderRadius: 6,
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: actioningId === action.id ? 0.6 : 1,
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
              {(data?.actions ?? []).length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                  No pending actions — all caught up!
                </div>
              )}
            </div>
          </div>

          {/* Right: Brief + Signals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Today's Brief */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}>
              <div style={{
                padding: '14px 18px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Today&apos;s Brief</h2>
                {data?.latestBrief && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Badge
                      text={`${data.latestBrief.signal_count} signals`}
                      color="#3B82F6"
                      bg="rgba(59,130,246,0.1)"
                    />
                    <Badge
                      text={`${data.latestBrief.critical_count} critical`}
                      color="#EF4444"
                      bg="rgba(239,68,68,0.1)"
                    />
                  </div>
                )}
              </div>
              <div style={{ padding: 18 }}>
                {data?.latestBrief ? (
                  <>
                    <div style={{
                      fontSize: 12,
                      color: '#0F172A',
                      lineHeight: 1.7,
                      marginBottom: 12,
                    }}>
                      {data.latestBrief.summary}
                    </div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>
                      Generated {new Date(data.latestBrief.generated_at).toLocaleString()}
                    </div>
                  </>
                ) : (
                  <div style={{
                    padding: '20px 0',
                    textAlign: 'center',
                    color: '#94A3B8',
                    fontSize: 13,
                  }}>
                    No brief generated yet —<br />click Generate above.
                  </div>
                )}
              </div>
            </div>

            {/* Top Signals */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}>
              <div style={{
                padding: '14px 18px',
                borderBottom: '1px solid #E2E8F0',
              }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Top Signals</h2>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Highest severity active alerts</div>
              </div>
              <div>
                {(data?.topSignals ?? []).map((sig, i) => (
                  <div key={sig.id} style={{
                    padding: '12px 18px',
                    borderBottom: i < (data?.topSignals ?? []).length - 1 ? '1px solid #F1F5F9' : 'none',
                  }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <Badge
                        text={sig.severity}
                        color={SEVERITY_COLORS[sig.severity] ?? '#64748B'}
                        bg={`${SEVERITY_COLORS[sig.severity] ?? '#64748B'}1A`}
                      />
                      <Badge
                        text={sig.source}
                        color="#3B82F6"
                        bg="rgba(59,130,246,0.1)"
                      />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>
                      {sig.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5 }}>
                      {sig.description.length > 100 ? sig.description.slice(0, 100) + '...' : sig.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
