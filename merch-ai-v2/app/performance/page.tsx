'use client'

import { useState, useEffect, useCallback } from 'react'

interface Signal {
  id: string
  signal_type: string
  metric: string
  title: string
  description: string
  recommendation: string
  impact: string
  severity: string
  source: string
  affected_skus: string
  status: string
  detected_at: string
}

interface Source {
  id: string
  name: string
  connected: boolean
  lastSync: string | null
  color: string
}

const SEVERITY_COLORS: Record<string, { color: string; bg: string }> = {
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  high:     { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  medium:   { color: '#6366F1', bg: 'rgba(99,102,241,0.1)' },
  low:      { color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
}

const SOURCE_COLORS: Record<string, { color: string; bg: string }> = {
  shopify:    { color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
  netsuite:   { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  lightspeed: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  sheets:     { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  system:     { color: '#64748B', bg: 'rgba(100,116,139,0.1)' },
}

const TYPE_TABS = ['all', 'anomaly', 'opportunity', 'alert'] as const

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

export default function PerformancePage() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [activeTab, setActiveTab] = useState<typeof TYPE_TABS[number]>('all')
  const [loading, setLoading] = useState(true)
  const [runningAnalysis, setRunningAnalysis] = useState(false)
  const [actioningId, setActioningId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/performance')
      const json = await res.json()
      setSignals(json.signals ?? [])
      setSources(json.sources ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleRunAnalysis = async () => {
    setRunningAnalysis(true)
    try {
      await fetch('/api/performance/run', { method: 'POST' })
      await fetchData()
    } finally {
      setRunningAnalysis(false)
    }
  }

  const handleAcknowledge = async (id: string) => {
    setActioningId(id)
    try {
      await fetch('/api/performance/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'acknowledge' }),
      })
      await fetchData()
    } finally {
      setActioningId(null)
    }
  }

  const filtered = signals.filter(s =>
    activeTab === 'all' ? true : s.signal_type === activeTab
  )

  const counts = {
    total: signals.length,
    critical: signals.filter(s => s.severity === 'critical').length,
    new: signals.filter(s => s.status === 'new').length,
  }

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
          <h1 style={{ fontSize: 16, fontWeight: 600, color: '#0F172A' }}>Daily Signals</h1>
          <div style={{ fontSize: 12, color: '#64748B' }}>Performance monitoring across all connected sources</div>
        </div>
        <button
          onClick={handleRunAnalysis}
          disabled={runningAnalysis}
          style={{
            background: runningAnalysis ? '#94A3B8' : '#6366F1',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: runningAnalysis ? 'not-allowed' : 'pointer',
          }}
        >
          {runningAnalysis ? '⏳ Running...' : '▶ Run Analysis'}
        </button>
      </div>

      <div style={{ padding: '0 32px 32px' }}>
        {/* Metric cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginTop: 24,
          marginBottom: 24,
        }}>
          {[
            { label: 'Total Signals', value: counts.total, color: '#6366F1', icon: '📊' },
            { label: 'Critical Alerts', value: counts.critical, color: '#EF4444', icon: '🚨' },
            { label: 'Sources Connected', value: '3 / 4', color: '#10B981', icon: '🔗' },
          ].map((card) => (
            <div key={card.label} style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}>
              <span style={{ fontSize: 28 }}>{card.icon}</span>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{card.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Signal list */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          marginBottom: 24,
        }}>
          {/* Tabs */}
          <div style={{
            padding: '0 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            gap: 0,
          }}>
            {TYPE_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '14px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid #6366F1' : '2px solid transparent',
                  color: activeTab === tab ? '#6366F1' : '#64748B',
                  fontWeight: activeTab === tab ? 600 : 400,
                  fontSize: 13,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab === 'all' ? `All Signals (${counts.total})` : tab.charAt(0).toUpperCase() + tab.slice(1) + 's'}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>Loading signals...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              No signals in this category.
            </div>
          ) : (
            filtered.map((sig, i) => {
              const sevColors = SEVERITY_COLORS[sig.severity] ?? SEVERITY_COLORS.low
              const srcColors = SOURCE_COLORS[sig.source] ?? SOURCE_COLORS.system
              const skus: string[] = JSON.parse(sig.affected_skus || '[]')
              const isActioning = actioningId === sig.id

              return (
                <div key={sig.id} style={{
                  padding: '18px 20px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Badge text={sig.severity} color={sevColors.color} bg={sevColors.bg} />
                      <Badge text={sig.source} color={srcColors.color} bg={srcColors.bg} />
                      <Badge text={sig.signal_type} color="#475569" bg="#F1F5F9" />
                      {sig.status === 'acknowledged' && (
                        <Badge text="acknowledged" color="#64748B" bg="#F1F5F9" />
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap', marginLeft: 8 }}>
                      {new Date(sig.detected_at).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ fontWeight: 600, fontSize: 14, color: '#0F172A', marginBottom: 6 }}>
                    {sig.title}
                  </div>

                  <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 10 }}>
                    {sig.description}
                  </div>

                  {/* Recommendation */}
                  <div style={{
                    padding: '10px 14px',
                    background: 'rgba(99,102,241,0.04)',
                    borderLeft: '3px solid #6366F1',
                    borderRadius: '0 6px 6px 0',
                    marginBottom: 10,
                    fontSize: 12,
                    color: '#4338CA',
                    lineHeight: 1.6,
                  }}>
                    <strong>Recommendation:</strong> {sig.recommendation}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981' }}>
                        {sig.impact}
                      </span>
                      {skus.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {skus.map((sku) => (
                            <span key={sku} style={{
                              padding: '1px 6px',
                              background: '#F1F5F9',
                              borderRadius: 4,
                              fontSize: 11,
                              color: '#475569',
                              fontFamily: 'JetBrains Mono, monospace',
                            }}>
                              {sku}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {sig.status === 'new' && (
                      <button
                        onClick={() => handleAcknowledge(sig.id)}
                        disabled={isActioning}
                        style={{
                          background: 'transparent',
                          color: '#6366F1',
                          border: '1px solid #6366F1',
                          borderRadius: 6,
                          padding: '5px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: isActioning ? 'not-allowed' : 'pointer',
                          opacity: isActioning ? 0.6 : 1,
                        }}
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Connected Sources */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Connected Sources</h2>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Integration status and last sync times</div>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            padding: 20,
          }}>
            {sources.map((src) => (
              <div key={src.id} style={{
                border: '1px solid #E2E8F0',
                borderRadius: 10,
                padding: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: src.connected ? '#10B981' : '#EF4444',
                    flexShrink: 0,
                  }} />
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>{src.name}</div>
                </div>
                <div style={{
                  fontSize: 11,
                  color: src.connected ? '#10B981' : '#EF4444',
                  fontWeight: 600,
                  marginBottom: 4,
                }}>
                  {src.connected ? 'Connected' : 'Not Connected'}
                </div>
                {src.lastSync && (
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>
                    Last sync: {new Date(src.lastSync).toLocaleTimeString()}
                  </div>
                )}
                {!src.connected && (
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>Click Settings to connect</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
