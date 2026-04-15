'use client'

import { useState } from 'react'

const INTEGRATIONS = [
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Sync product catalog, orders, and inventory',
    color: '#10B981',
    status: 'connected' as const,
    account: 'mystore.myshopify.com',
    lastSync: '2 minutes ago',
  },
  {
    id: 'netsuite',
    name: 'NetSuite',
    description: 'Financial data, POs, and supplier management',
    color: '#3B82F6',
    status: 'connected' as const,
    account: 'corp.netsuite.com',
    lastSync: '15 minutes ago',
  },
  {
    id: 'lightspeed',
    name: 'Lightspeed',
    description: 'POS data and in-store inventory',
    color: '#8B5CF6',
    status: 'disconnected' as const,
    account: null,
    lastSync: null,
  },
  {
    id: 'sheets',
    name: 'Google Sheets',
    description: 'Buying plans, budgets, and ad-hoc reporting',
    color: '#F59E0B',
    status: 'connected' as const,
    account: 'merchandising@brand.com',
    lastSync: '1 hour ago',
  },
]

function IntegrationCard({
  integration,
}: {
  integration: typeof INTEGRATIONS[number]
}) {
  const [keyValue, setKeyValue] = useState('')
  const [showKey, setShowKey] = useState(false)
  const connected = integration.status === 'connected'

  return (
    <div style={{
      border: '1px solid #E2E8F0', borderRadius: 12, padding: 20,
      background: '#FFFFFF',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40,
            background: `${integration.color}18`,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, color: integration.color,
          }}>
            {integration.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#0F172A' }}>{integration.name}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{integration.description}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? '#10B981' : '#EF4444',
          }} />
          <span style={{
            fontSize: 12, fontWeight: 600,
            color: connected ? '#10B981' : '#EF4444',
          }}>
            {connected ? 'Connected' : 'Not connected'}
          </span>
        </div>
      </div>

      {connected && integration.account && (
        <div style={{
          background: '#F8FAFC', borderRadius: 8, padding: '8px 12px',
          fontSize: 12, color: '#475569', marginBottom: 14,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>{integration.account}</span>
          {integration.lastSync && (
            <span style={{ color: '#94A3B8' }}>Synced {integration.lastSync}</span>
          )}
        </div>
      )}

      {!connected && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
            API Key / Token
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="Enter your API key..."
              style={{
                flex: 1, padding: '8px 10px', border: '1px solid #E2E8F0',
                borderRadius: 7, fontSize: 12, outline: 'none', color: '#0F172A',
              }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{
                background: '#F1F5F9', border: '1px solid #E2E8F0',
                borderRadius: 7, padding: '0 10px', cursor: 'pointer', fontSize: 12, color: '#64748B',
              }}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
        </div>
      )}

      <button
        style={{
          background: connected ? 'transparent' : integration.color,
          color: connected ? '#EF4444' : '#fff',
          border: connected ? '1px solid #FCA5A5' : 'none',
          borderRadius: 7, padding: '7px 14px', fontSize: 12,
          fontWeight: 600, cursor: 'pointer',
        }}
      >
        {connected ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const [confidenceThreshold, setConfidenceThreshold] = useState(65)
  const [maxPriceChangePct, setMaxPriceChangePct] = useState(20)
  const [minMarginFloor, setMinMarginFloor] = useState(40)
  const [autoApprove, setAutoApprove] = useState(false)
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [activeSection, setActiveSection] = useState<'integrations' | 'agents' | 'guardrails' | 'about'>('integrations')

  const SECTIONS = [
    { id: 'integrations', label: 'Integrations' },
    { id: 'agents', label: 'Agent Configuration' },
    { id: 'guardrails', label: 'Global Guardrails' },
    { id: 'about', label: 'About' },
  ] as const

  return (
    <div>
      {/* Top bar */}
      <div style={{
        height: 56, background: '#FFFFFF', borderBottom: '1px solid #E2E8F0',
        display: 'flex', alignItems: 'center', padding: '0 32px',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: '#0F172A' }}>Settings</h1>
          <div style={{ fontSize: 12, color: '#64748B' }}>Configure integrations, agent behavior, and guardrails</div>
        </div>
      </div>

      <div style={{ padding: '32px 32px 48px', maxWidth: 900 }}>
        {/* Section tabs */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 28,
          background: '#FFFFFF', border: '1px solid #E2E8F0',
          borderRadius: 10, padding: 4, width: 'fit-content',
        }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                padding: '7px 16px', borderRadius: 7, border: 'none',
                background: activeSection === s.id ? '#6366F1' : 'transparent',
                color: activeSection === s.id ? '#fff' : '#64748B',
                fontWeight: activeSection === s.id ? 600 : 400,
                fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {activeSection === 'integrations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>Data Integrations</h2>
              <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6 }}>
                Connect your data sources. MerchAI reads from these systems to generate signals, forecasts, and pricing recommendations.
                Write operations (price updates, PO submissions) require connected credentials and explicit approval.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {INTEGRATIONS.map((intg) => <IntegrationCard key={intg.id} integration={intg} />)}
            </div>
            <div style={{
              background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
              padding: '12px 16px', fontSize: 12, color: '#92400E', lineHeight: 1.6,
            }}>
              <strong>Note:</strong> API keys are stored encrypted in the local database. In production, use a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault). Never commit credentials to version control.
            </div>
          </div>
        )}

        {activeSection === 'agents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>Agent Configuration</h2>
              <p style={{ fontSize: 13, color: '#64748B' }}>
                Control how agents generate and surface recommendations.
              </p>
            </div>

            <div style={{
              background: '#FFFFFF', border: '1px solid #E2E8F0',
              borderRadius: 12, overflow: 'hidden',
            }}>
              {[
                {
                  label: 'Confidence Threshold',
                  description: 'Minimum confidence score to surface a recommendation',
                  value: confidenceThreshold,
                  setValue: setConfidenceThreshold,
                  min: 30, max: 95, suffix: '%',
                },
                {
                  label: 'Max Pricing Change',
                  description: 'Global cap on recommended price changes (overridden by per-SKU guardrails)',
                  value: maxPriceChangePct,
                  setValue: setMaxPriceChangePct,
                  min: 5, max: 50, suffix: '%',
                },
              ].map((setting, i) => (
                <div key={setting.label} style={{
                  padding: '20px 24px',
                  borderBottom: i === 0 ? '1px solid #E2E8F0' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{setting.label}</div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{setting.description}</div>
                    </div>
                    <span style={{
                      fontSize: 20, fontWeight: 700, color: '#6366F1', minWidth: 60, textAlign: 'right',
                    }}>
                      {setting.value}{setting.suffix}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={setting.min}
                    max={setting.max}
                    step={5}
                    value={setting.value}
                    onChange={(e) => setting.setValue(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: '#6366F1' }}
                  />
                </div>
              ))}
            </div>

            <div style={{
              background: '#FFFFFF', border: '1px solid #E2E8F0',
              borderRadius: 12, padding: '20px 24px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Auto-approve low-risk actions</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    Automatically apply approved actions below confidence threshold without manual review
                  </div>
                </div>
                <button
                  onClick={() => setAutoApprove(!autoApprove)}
                  style={{
                    width: 44, height: 24, borderRadius: 12,
                    background: autoApprove ? '#6366F1' : '#CBD5E1',
                    border: 'none', cursor: 'pointer', position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3, left: autoApprove ? 23 : 3,
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
              </div>
              {autoApprove && (
                <div style={{
                  fontSize: 12, color: '#92400E', background: '#FFFBEB',
                  border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginTop: 8,
                }}>
                  ⚠ Auto-approve is enabled. Actions below {confidenceThreshold}% confidence will execute without review.
                  Use with caution in production environments.
                </div>
              )}
            </div>

            <div style={{
              background: '#FFFFFF', border: '1px solid #E2E8F0',
              borderRadius: 12, padding: '20px 24px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Email alerts for critical signals</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    Send email when critical severity signals are detected
                  </div>
                </div>
                <button
                  onClick={() => setEmailAlerts(!emailAlerts)}
                  style={{
                    width: 44, height: 24, borderRadius: 12,
                    background: emailAlerts ? '#6366F1' : '#CBD5E1',
                    border: 'none', cursor: 'pointer', position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3, left: emailAlerts ? 23 : 3,
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
              </div>
            </div>

            <button style={{
              background: '#6366F1', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', width: 'fit-content',
            }}>
              Save Configuration
            </button>
          </div>
        )}

        {activeSection === 'guardrails' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>Global Guardrails</h2>
              <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6 }}>
                Hard constraints applied to all agent recommendations. Per-SKU guardrails in the Pricing module override these.
              </p>
            </div>

            <div style={{
              background: '#FFFFFF', border: '1px solid #E2E8F0',
              borderRadius: 12, overflow: 'hidden',
            }}>
              {[
                {
                  label: 'Maximum price change per action',
                  description: 'No single recommendation can change a price by more than this',
                  value: maxPriceChangePct,
                  setValue: setMaxPriceChangePct,
                  min: 5, max: 50, suffix: '%',
                },
                {
                  label: 'Minimum margin floor',
                  description: 'Recommendations will never suggest prices below this gross margin',
                  value: minMarginFloor,
                  setValue: setMinMarginFloor,
                  min: 10, max: 70, suffix: '%',
                },
              ].map((g, i) => (
                <div key={g.label} style={{
                  padding: '20px 24px',
                  borderBottom: i === 0 ? '1px solid #E2E8F0' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{g.label}</div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{g.description}</div>
                    </div>
                    <span style={{ fontSize: 20, fontWeight: 700, color: '#F59E0B', minWidth: 60, textAlign: 'right' }}>
                      {g.value}{g.suffix}
                    </span>
                  </div>
                  <input
                    type="range" min={g.min} max={g.max} step={5} value={g.value}
                    onChange={(e) => g.setValue(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: '#F59E0B' }}
                  />
                </div>
              ))}
            </div>

            <button style={{
              background: '#6366F1', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', width: 'fit-content',
            }}>
              Save Guardrails
            </button>
          </div>
        )}

        {activeSection === 'about' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{
              background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div style={{
                  width: 48, height: 48,
                  background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                  borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                }}>⚡</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: '#0F172A' }}>MerchAI v2 Platform</div>
                  <div style={{ fontSize: 13, color: '#6366F1', fontWeight: 600 }}>v2-platform branch</div>
                </div>
              </div>
              {[
                { label: 'Version', value: '2.0.0' },
                { label: 'Branch', value: 'feature/v2-platform (worktree-agent-ae635c08)' },
                { label: 'Port', value: '3002 (isolated from v1 on 3001)' },
                { label: 'AI Model', value: 'claude-sonnet-4-5' },
                { label: 'Database', value: 'SQLite — data/v2.db' },
                { label: 'Stack', value: 'Next.js 14 App Router + TypeScript' },
                { label: 'v1 App', value: 'Preserved intact at merch-ai/ — runs on port 3001' },
              ].map((row) => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13,
                }}>
                  <span style={{ color: '#64748B', fontWeight: 500 }}>{row.label}</span>
                  <span style={{ color: '#0F172A', fontFamily: row.label === 'Branch' || row.label === 'Database' ? 'JetBrains Mono, monospace' : 'inherit', fontSize: row.label === 'Branch' ? 11 : 13 }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
