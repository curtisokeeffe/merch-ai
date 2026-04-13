'use client'

import { useState } from 'react'

const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

const DEMO_USER = {
  name: "Curtis O'Keeffe",
  email: 'cokeeffe1@babson.edu',
  role: 'Merchandising Manager',
  org: 'Babson College',
  department: 'Retail Operations',
  location: 'Boston, MA',
  joined: 'March 2024',
  plan: 'Pro',
  initials: 'CO',
}

const AGENT_DEFS = [
  { name: 'Markdown Agent',   color: '#EF4444', light: '#FEF2F2', border: '#FCA5A5', icon: '📉' },
  { name: 'Pricing Agent',    color: '#F59E0B', light: '#FFFBEB', border: '#FCD34D', icon: '💰' },
  { name: 'Assortment Agent', color: '#22C55E', light: '#F0FDF4', border: '#86EFAC', icon: '📦' },
  { name: 'Risk Agent',       color: '#8B5CF6', light: '#F5F3FF', border: '#C4B5FD', icon: '🛡'  },
]

export default function ProfilePage() {
  const [saved, setSaved] = useState(false)
  const [notifSignals, setNotifSignals] = useState(true)
  const [notifChanges, setNotifChanges] = useState(true)
  const [notifWeekly, setNotifWeekly] = useState(false)
  const [autoApprove, setAutoApprove] = useState(false)
  const [defaultAgent, setDefaultAgent] = useState('Markdown Agent')

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: value ? '#F59E0B' : '#E2E8F0',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: 'white',
        position: 'absolute', top: 3, left: value ? 23 : 3,
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )

  return (
    <div style={{ paddingTop: 56, minHeight: '100vh', background: '#F8FAFC', fontFamily: SANS }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '20px 28px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Profile & Settings</h1>
        <p style={{ fontSize: 14, color: '#64748B' }}>Manage your account, preferences, and agent defaults.</p>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px' }}>

        {/* User card */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '24px', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #F59E0B, #EF4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: 'white', flexShrink: 0 }}>
              {DEMO_USER.initials}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>{DEMO_USER.name}</h2>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 4, padding: '2px 8px', fontFamily: MONO, letterSpacing: '0.5px' }}>{DEMO_USER.plan}</span>
              </div>
              <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>{DEMO_USER.role} · {DEMO_USER.org}</div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {[
                  { label: 'Email',      value: DEMO_USER.email      },
                  { label: 'Department', value: DEMO_USER.department  },
                  { label: 'Location',   value: DEMO_USER.location    },
                  { label: 'Member since', value: DEMO_USER.joined   },
                ].map((f) => (
                  <div key={f.label}>
                    <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{f.label}</div>
                    <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 500 }}>{f.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <button style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#64748B', cursor: 'pointer', fontFamily: SANS, flexShrink: 0 }}>
              Edit Profile
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Signals Reviewed', value: '24', icon: '📋' },
            { label: 'Actions Approved', value: '18', icon: '✓'  },
            { label: 'Value Unlocked',   value: '$42k', icon: '💰' },
            { label: 'Agents Active',    value: '4', icon: '⚙'    },
          ].map((s) => (
            <div key={s.label} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: '#F59E0B', marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Notification preferences */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #E2E8F0', fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
            Notifications
          </div>
          {[
            { label: 'New signal alerts',        desc: 'Notify when agents flag new signals',       value: notifSignals,  set: setNotifSignals  },
            { label: 'Action confirmations',     desc: 'Confirm when mutations are applied',         value: notifChanges,  set: setNotifChanges  },
            { label: 'Weekly impact summary',    desc: 'Weekly email digest of agent performance',   value: notifWeekly,   set: setNotifWeekly   },
          ].map((item, i) => (
            <div key={item.label}>
              {i > 0 && <div style={{ height: 1, background: '#F1F5F9' }} />}
              <div style={{ padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#1E293B', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>{item.desc}</div>
                </div>
                <Toggle value={item.value} onChange={item.set} />
              </div>
            </div>
          ))}
        </div>

        {/* Agent defaults */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #E2E8F0', fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
            Agent Defaults
          </div>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#1E293B', marginBottom: 2 }}>Auto-approve low-risk signals</div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>Automatically apply green-severity recommendations</div>
            </div>
            <Toggle value={autoApprove} onChange={setAutoApprove} />
          </div>
          <div style={{ padding: '14px 22px' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#1E293B', marginBottom: 8 }}>Default agent on Dashboard</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {AGENT_DEFS.map((a) => (
                <button
                  key={a.name}
                  onClick={() => setDefaultAgent(a.name)}
                  style={{
                    background: defaultAgent === a.name ? a.light : '#F8FAFC',
                    border: `1px solid ${defaultAgent === a.name ? a.border : '#E2E8F0'}`,
                    borderRadius: 7, padding: '7px 14px',
                    fontSize: 12, fontWeight: defaultAgent === a.name ? 700 : 400,
                    color: defaultAgent === a.name ? a.color : '#64748B',
                    cursor: 'pointer', fontFamily: SANS, transition: 'all 0.15s',
                  }}
                >
                  {a.icon} {a.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* API / Integration */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #E2E8F0', fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
            Integration
          </div>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B', marginBottom: 6 }}>Anthropic API Key</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: '#94A3B8', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '8px 12px', flex: 1 }}>
                sk-ant-api03-••••••••••••••••••••••••
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#22C55E', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 5, padding: '4px 10px' }}>Active</span>
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>Stored in .env.local · never committed to git</div>
          </div>
          <div style={{ padding: '14px 22px' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B', marginBottom: 6 }}>Data Source</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: '#94A3B8', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '8px 12px', flex: 1 }}>
                SQLite · data/demo.db · live mutations enabled
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#22C55E', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 5, padding: '4px 10px' }}>Connected</span>
            </div>
          </div>
        </div>

        {/* Save + danger zone */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={handleSave}
            style={{
              background: saved ? '#22C55E' : '#F59E0B', border: 'none', borderRadius: 8,
              padding: '10px 24px', fontSize: 14, fontWeight: 600,
              color: 'white', cursor: 'pointer', fontFamily: SANS, transition: 'background 0.2s',
            }}
          >
            {saved ? '✓ Saved' : 'Save Preferences'}
          </button>
          <button style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 20px', fontSize: 13, color: '#EF4444', cursor: 'pointer', fontFamily: SANS }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
