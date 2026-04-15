'use client'

import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { PLATFORMS, type Platform } from '@/lib/platforms'

const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

interface ConnectionRecord {
  id: string
  platform: string
  display_name: string
  auth_type: string
  credentials: string
  status: string
  connected_account: string | null
  read_permissions: string
  write_permissions: string
  guardrails: string
  created_at: string
  last_synced_at: string | null
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!active)}
      style={{
        position: 'relative', width: 40, height: 22, borderRadius: 11,
        background: active ? '#F59E0B' : '#E2E8F0',
        cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: active ? 20 : 2,
        width: 18, height: 18, borderRadius: '50%',
        background: 'white', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <h3 style={{
        margin: '0 0 12px', fontSize: 11, fontWeight: 700,
        color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.8px',
      }}>
        {title}
      </h3>
      <div style={{
        background: 'white', border: '1px solid #E2E8F0',
        borderRadius: 10, padding: '16px 18px',
      }}>
        {children}
      </div>
    </div>
  )
}

const RISK_COLORS = {
  Low:    { bg: '#F0FDF4', text: '#16A34A', border: '#86EFAC' },
  Medium: { bg: '#FFFBEB', text: '#D97706', border: '#FCD34D' },
  High:   { bg: '#FEF2F2', text: '#DC2626', border: '#FCA5A5' },
} as const

const STATUS_META = {
  connected:     { bg: '#F0FDF4', text: '#16A34A', dot: '#22C55E', label: 'Connected' },
  not_connected: { bg: '#F8FAFC', text: '#94A3B8', dot: '#CBD5E1', label: 'Not connected' },
  error:         { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444', label: 'Error' },
} as const

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Panel state
  const [selected, setSelected] = useState<Platform | null>(null)
  const [panelCreds, setPanelCreds] = useState<Record<string, string>>({})
  const [panelReadPerms, setPanelReadPerms] = useState<Set<string>>(new Set())
  const [panelWritePerms, setPanelWritePerms] = useState<Set<string>>(new Set())
  const [panelGuardrails, setPanelGuardrails] = useState<Record<string, number>>({})
  const [oauthConnected, setOauthConnected] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [testingConn, setTestingConn] = useState(false)
  const [testResult, setTestResult] = useState<'success' | string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Load connections
  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then(d => { setConnections(d.connections || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const getConn = (pid: string) => connections.find(c => c.platform === pid)

  // Filter + sort
  const sorted = useMemo(() => {
    const q = search.toLowerCase().trim()
    const filtered = q
      ? PLATFORMS.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      : PLATFORMS
    return [...filtered].sort((a, b) => {
      const ac = getConn(a.id)
      const bc = getConn(b.id)
      if (ac && !bc) return -1
      if (!ac && bc) return 1
      return a.name.localeCompare(b.name)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, connections])

  // Group by category
  const grouped = useMemo(() => {
    const g: Record<string, Platform[]> = {}
    for (const p of sorted) {
      if (!g[p.category]) g[p.category] = []
      g[p.category].push(p)
    }
    return g
  }, [sorted])

  // Open config panel
  const openPanel = (platform: Platform) => {
    const conn = getConn(platform.id)
    if (conn) {
      try {
        const rp: string[] = JSON.parse(conn.read_permissions)
        const wp: string[] = JSON.parse(conn.write_permissions)
        const gr: Record<string, number> = JSON.parse(conn.guardrails)
        setPanelReadPerms(new Set(rp))
        setPanelWritePerms(new Set(wp))
        setPanelGuardrails(gr)
      } catch {
        resetPanelDefaults(platform)
      }
      setOauthConnected(conn.status === 'connected' && platform.authType === 'oauth')
    } else {
      resetPanelDefaults(platform)
      setOauthConnected(false)
    }
    setPanelCreds({})
    setTestResult(null)
    setSaveSuccess(false)
    setConfirmDisconnect(false)
    setSelected(platform)
  }

  const resetPanelDefaults = (platform: Platform) => {
    setPanelReadPerms(new Set(platform.readPermissions.map(p => p.id)))
    setPanelWritePerms(new Set(platform.writePermissions.filter(p => p.defaultOn).map(p => p.id)))
    setPanelGuardrails(Object.fromEntries(platform.guardrails.map(g => [g.id, g.defaultValue])))
  }

  const closePanel = () => {
    setSelected(null)
    setConfirmDisconnect(false)
    setSaveSuccess(false)
  }

  // Save / connect
  const doSave = async (connectedAccount: string | null) => {
    if (!selected) return
    setSaving(true)
    setSaveSuccess(false)
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: selected.id,
          displayName: selected.name,
          authType: selected.authType,
          credentials: panelCreds,
          readPermissions: Array.from(panelReadPerms),
          writePermissions: Array.from(panelWritePerms),
          guardrails: panelGuardrails,
          connectedAccount,
        }),
      })
      const data = await res.json()
      if (data.ok && data.connection) {
        setConnections(prev => {
          const idx = prev.findIndex(c => c.platform === selected.id)
          if (idx >= 0) {
            const next = [...prev]; next[idx] = data.connection; return next
          }
          return [...prev, data.connection]
        })
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleOAuthConnect = () => {
    setOauthConnected(true)
    doSave('demo@example.com')  // v1 mock; replace with real OAuth redirect in v2
  }

  const handleSave = () => {
    const conn = selected ? getConn(selected.id) : null
    const account = oauthConnected
      ? (conn?.connected_account || 'demo@example.com')
      : null
    doSave(account)
  }

  const handleDisconnect = async () => {
    if (!selected) return
    const conn = getConn(selected.id)
    if (!conn) return
    setDisconnecting(true)
    try {
      await fetch(`/api/connections/${conn.id}`, { method: 'DELETE' })
      setConnections(prev => prev.filter(c => c.platform !== selected.id))
      setOauthConnected(false)
      closePanel()
    } catch (e) { console.error(e) }
    finally { setDisconnecting(false) }
  }

  const handleTestConnection = async () => {
    setTestingConn(true)
    setTestResult(null)
    await new Promise(r => setTimeout(r, 1200))  // v1 stub; wire real connection test in v2
    setTestResult('success')
    setTestingConn(false)
  }

  const conn = selected ? getConn(selected.id) : null
  const isConnected = conn?.status === 'connected' || (selected?.authType === 'oauth' && oauthConnected)
  const primaryBtnLabel = selected?.authType === 'oauth' && !isConnected
    ? `Connect ${selected.name}`
    : saving ? 'Saving…' : 'Save configuration'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: SANS }}>
      {/* Header */}
      <div style={{
        padding: '26px 32px 20px',
        borderBottom: '1px solid #E2E8F0',
        background: 'white',
      }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0F172A' }}>Connections</h1>
        <p style={{ margin: '5px 0 0', fontSize: 14, color: '#64748B' }}>
          Connect your platforms so the AI agent can read data and take actions.
        </p>
      </div>

      {/* Search */}
      <div style={{ padding: '18px 32px 0' }}>
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <span style={{
            position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
            fontSize: 14, color: '#94A3B8', pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="text"
            placeholder="Search platforms…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 34px',
              border: '1px solid #E2E8F0', borderRadius: 8,
              fontSize: 13, color: '#1E293B', background: 'white',
              outline: 'none', fontFamily: SANS, boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Platform grid */}
      <div style={{ padding: '20px 32px 48px' }}>
        {loading ? (
          <div style={{ color: '#94A3B8', fontSize: 14, paddingTop: 20 }}>Loading connections…</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
            <p style={{ color: '#64748B', fontSize: 14 }}>
              Don&apos;t see your platform?{' '}
              <a href="mailto:support@merchai.com" style={{ color: '#F59E0B', textDecoration: 'none' }}>
                Let us know and we&apos;ll prioritize it.
              </a>
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([category, platforms]) => (
            <div key={category} style={{ marginBottom: 30 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#94A3B8',
                textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10,
              }}>
                {category}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))',
                gap: 10,
              }}>
                {platforms.map(platform => {
                  const c = getConn(platform.id)
                  const statusKey = (c?.status || 'not_connected') as keyof typeof STATUS_META
                  const sm = STATUS_META[statusKey] || STATUS_META.not_connected
                  return (
                    <div
                      key={platform.id}
                      onClick={() => openPanel(platform)}
                      style={{
                        background: 'white',
                        border: `1px solid ${c?.status === 'connected' ? '#D1FAE5' : '#E2E8F0'}`,
                        borderRadius: 10, padding: '14px 15px',
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        transition: 'box-shadow 0.15s, border-color 0.15s',
                      }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLDivElement
                        el.style.boxShadow = '0 4px 14px rgba(0,0,0,0.09)'
                        el.style.borderColor = '#F59E0B'
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLDivElement
                        el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
                        el.style.borderColor = c?.status === 'connected' ? '#D1FAE5' : '#E2E8F0'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 7 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 19 }}>{platform.logo}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{platform.name}</span>
                        </div>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: sm.bg, color: sm.text,
                          borderRadius: 20, padding: '2px 8px',
                          fontSize: 10, fontWeight: 600, flexShrink: 0,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: sm.dot, display: 'inline-block' }} />
                          {sm.label}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
                        {platform.description}
                      </p>
                      {c?.last_synced_at && (
                        <div style={{ marginTop: 7, fontSize: 11, color: '#94A3B8' }}>
                          Last active {new Date(c.last_synced_at).toLocaleDateString()}
                        </div>
                      )}
                      {c?.status === 'error' && (
                        <button
                          onClick={e => { e.stopPropagation(); openPanel(platform) }}
                          style={{
                            marginTop: 8, padding: '3px 9px',
                            background: '#FEF2F2', border: '1px solid #FCA5A5',
                            borderRadius: 5, fontSize: 11, color: '#DC2626',
                            cursor: 'pointer', fontFamily: SANS,
                          }}
                        >
                          Reconnect
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Config panel */}
      {selected && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.28)', zIndex: 200 }}
            onClick={closePanel}
          />
          {/* Drawer */}
          <div style={{
            position: 'fixed', top: 56, right: 0, bottom: 0, width: 480,
            background: 'white', borderLeft: '1px solid #E2E8F0',
            boxShadow: '-8px 0 30px rgba(0,0,0,0.1)',
            zIndex: 201, display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
          }}>
            {/* Panel header */}
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              position: 'sticky', top: 0, background: 'white', zIndex: 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{selected.logo}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{selected.name}</div>
                  {isConnected && (
                    <div style={{ fontSize: 12, color: '#16A34A' }}>
                      ✓ Connected{conn?.connected_account ? ` as ${conn.connected_account}` : ''}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={closePanel}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: '1px solid #E2E8F0', background: '#F8FAFC',
                  cursor: 'pointer', fontSize: 16, color: '#64748B',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: SANS,
                }}
              >×</button>
            </div>

            {/* Panel body */}
            <div style={{ padding: '22px 22px 12px', flex: 1 }}>

              {/* 1. Authentication */}
              <Section title="Authentication">
                {selected.authType === 'oauth' && (
                  isConnected ? (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: '#F0FDF4', border: '1px solid #86EFAC',
                      borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#16A34A',
                    }}>
                      <span>✓</span>
                      <span>Connected as {conn?.connected_account || 'demo@example.com'}</span>
                    </div>
                  ) : (
                    <button
                      onClick={handleOAuthConnect}
                      style={{
                        padding: '9px 20px', background: '#F59E0B',
                        border: 'none', borderRadius: 8,
                        color: 'white', fontWeight: 600, fontSize: 14,
                        cursor: 'pointer', fontFamily: SANS,
                      }}
                    >
                      Connect {selected.name}
                    </button>
                  )
                )}

                {selected.authType === 'api_key' && (
                  <div>
                    {selected.apiKeyFields?.map(field => (
                      <div key={field.id} style={{ marginBottom: 13 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                          {field.label}{field.required && <span style={{ color: '#EF4444' }}> *</span>}
                        </label>
                        <input
                          type={field.type === 'password' ? 'password' : 'text'}
                          value={panelCreds[field.id] || ''}
                          onChange={e => setPanelCreds(p => ({ ...p, [field.id]: e.target.value }))}
                          placeholder={field.type === 'password' ? '••••••••' : `Enter ${field.label.toLowerCase()}`}
                          style={{
                            width: '100%', padding: '8px 11px',
                            border: '1px solid #E2E8F0', borderRadius: 7,
                            fontSize: 13, color: '#1E293B',
                            fontFamily: field.type === 'password' ? MONO : SANS,
                            outline: 'none', boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    ))}
                    {selected.docsUrl && (
                      <a
                        href={selected.docsUrl} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: '#F59E0B', textDecoration: 'none' }}
                      >
                        Where do I find this? →
                      </a>
                    )}
                  </div>
                )}

                {selected.authType === 'database' && (
                  <div>
                    {selected.databaseFields?.map(field => (
                      <div key={field.id} style={{ marginBottom: 13 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                          {field.label}
                        </label>
                        <input
                          type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
                          value={panelCreds[field.id] || ''}
                          onChange={e => setPanelCreds(p => ({ ...p, [field.id]: e.target.value }))}
                          placeholder={field.placeholder}
                          style={{
                            width: '100%', padding: '8px 11px',
                            border: '1px solid #E2E8F0', borderRadius: 7,
                            fontSize: 13, color: '#1E293B',
                            fontFamily: field.type === 'password' ? MONO : SANS,
                            outline: 'none', boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <button
                        onClick={handleTestConnection}
                        disabled={testingConn}
                        style={{
                          padding: '7px 14px', background: '#F8FAFC',
                          border: '1px solid #E2E8F0', borderRadius: 7,
                          fontSize: 12, color: '#64748B',
                          cursor: testingConn ? 'not-allowed' : 'pointer', fontFamily: SANS,
                        }}
                      >
                        {testingConn ? 'Testing…' : 'Test connection'}
                      </button>
                      {testResult === 'success' && (
                        <span style={{ fontSize: 12, color: '#16A34A' }}>✓ Connection successful</span>
                      )}
                      {testResult && testResult !== 'success' && (
                        <span style={{ fontSize: 12, color: '#DC2626' }}>✗ {testResult}</span>
                      )}
                    </div>
                  </div>
                )}
              </Section>

              {/* 2. Read permissions */}
              {selected.readPermissions.length > 0 && (
                <Section title="What the agent can read">
                  {selected.readPermissions.map((perm, i) => (
                    <div key={perm.id}>
                      {i > 0 && <div style={{ height: 1, background: '#F1F5F9', margin: '10px 0' }} />}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <Toggle
                          active={panelReadPerms.has(perm.id)}
                          onChange={v => setPanelReadPerms(prev => {
                            const next = new Set(prev)
                            v ? next.add(perm.id) : next.delete(perm.id)
                            return next
                          })}
                        />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>{perm.label}</div>
                          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{perm.description}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {/* 3. Write permissions */}
              {selected.writePermissions.length > 0 && (
                <Section title="What the agent is allowed to change">
                  <div style={{
                    fontSize: 12, color: '#92400E', lineHeight: 1.5,
                    padding: '9px 12px', background: '#FFFBEB',
                    border: '1px solid #FCD34D', borderRadius: 7, marginBottom: 14,
                  }}>
                    The agent will never exceed these permissions. Changes above your configured thresholds will always be sent for human approval first.
                  </div>
                  {selected.writePermissions.map((perm, i) => {
                    const rc = RISK_COLORS[perm.risk]
                    return (
                      <div key={perm.id}>
                        {i > 0 && <div style={{ height: 1, background: '#F1F5F9', margin: '10px 0' }} />}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <Toggle
                            active={panelWritePerms.has(perm.id)}
                            onChange={v => setPanelWritePerms(prev => {
                              const next = new Set(prev)
                              v ? next.add(perm.id) : next.delete(perm.id)
                              return next
                            })}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>{perm.label}</span>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                background: rc.bg, color: rc.text, border: `1px solid ${rc.border}`,
                                letterSpacing: '0.5px',
                              }}>
                                {perm.risk.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{perm.description}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </Section>
              )}

              {/* 4. Guardrails */}
              {selected.guardrails.length > 0 && (
                <Section title="Guardrail settings">
                  {selected.guardrails.map((g, i) => {
                    const val = panelGuardrails[g.id] ?? g.defaultValue
                    const invalid = val < g.min || val > g.max
                    return (
                      <div key={g.id}>
                        {i > 0 && <div style={{ height: 1, background: '#F1F5F9', margin: '14px 0' }} />}
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 3 }}>
                          {g.label}
                        </label>
                        <p style={{ margin: '0 0 7px', fontSize: 12, color: '#64748B' }}>{g.description}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="number"
                            value={val}
                            min={g.min}
                            max={g.max}
                            onChange={e => setPanelGuardrails(prev => ({ ...prev, [g.id]: Number(e.target.value) }))}
                            style={{
                              width: 90, padding: '7px 10px',
                              border: `1px solid ${invalid ? '#FCA5A5' : '#E2E8F0'}`,
                              borderRadius: 7, fontSize: 14, color: '#1E293B',
                              fontFamily: MONO, outline: 'none',
                            }}
                          />
                          <span style={{ fontSize: 13, color: '#64748B' }}>{g.unit}</span>
                          {invalid && (
                            <span style={{ fontSize: 11, color: '#DC2626' }}>Must be {g.min}–{g.max}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </Section>
              )}

            </div>

            {/* Panel footer */}
            <div style={{
              padding: '14px 22px',
              borderTop: '1px solid #E2E8F0',
              background: '#FAFAFA',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10,
            }}>
              {/* Disconnect */}
              {conn ? (
                confirmDisconnect ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#64748B' }}>Disconnect {selected.name}?</span>
                    <button
                      onClick={handleDisconnect} disabled={disconnecting}
                      style={{
                        padding: '5px 12px', background: '#EF4444', border: 'none',
                        borderRadius: 6, color: 'white', fontSize: 12, fontWeight: 600,
                        cursor: disconnecting ? 'not-allowed' : 'pointer', fontFamily: SANS,
                      }}
                    >
                      {disconnecting ? 'Removing…' : 'Yes, disconnect'}
                    </button>
                    <button
                      onClick={() => setConfirmDisconnect(false)}
                      style={{
                        padding: '5px 12px', background: 'white', border: '1px solid #E2E8F0',
                        borderRadius: 6, color: '#64748B', fontSize: 12,
                        cursor: 'pointer', fontFamily: SANS,
                      }}
                    >Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDisconnect(true)}
                    style={{
                      padding: '7px 14px', background: 'white',
                      border: '1px solid #FCA5A5', borderRadius: 7,
                      color: '#DC2626', fontSize: 12, cursor: 'pointer', fontFamily: SANS,
                    }}
                  >Disconnect</button>
                )
              ) : <div />}

              {/* Save */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {saveSuccess && <span style={{ fontSize: 12, color: '#16A34A' }}>✓ Saved</span>}
                <button
                  onClick={selected.authType === 'oauth' && !isConnected ? handleOAuthConnect : handleSave}
                  disabled={saving}
                  style={{
                    padding: '8px 18px',
                    background: saving ? '#FCD34D' : '#F59E0B',
                    border: 'none', borderRadius: 8,
                    color: 'white', fontWeight: 600, fontSize: 13,
                    cursor: saving ? 'not-allowed' : 'pointer', fontFamily: SANS,
                    transition: 'background 0.15s',
                  }}
                >
                  {primaryBtnLabel}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
