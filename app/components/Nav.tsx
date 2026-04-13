'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

const DEMO_USER = {
  name: "Curtis O'Keeffe",
  email: 'cokeeffe1@babson.edu',
  role: 'Merchandising Manager',
  org: 'Babson College',
  initials: 'CO',
  plan: 'Pro',
}

const NAV_LINKS = [
  { href: '/',        label: 'Dashboard' },
  { href: '/agents',  label: 'Agents'    },
  { href: '/changes', label: 'Changes'   },
  { href: '/data',    label: 'Data'      },
]

const APP_MENU_SECTIONS = [
  {
    title: 'Navigate',
    items: [
      { href: '/',        label: 'Dashboard',     desc: 'KPIs, top signals, quick deploy' },
      { href: '/agents',  label: 'Agents',        desc: 'Run, query, and configure agents' },
      { href: '/changes', label: 'Changes',       desc: 'History, impact reports, redeploy' },
      { href: '/data',    label: 'Data Analysis', desc: 'Database peek and simulations' },
    ],
  },
  {
    title: 'Actions',
    items: [
      { href: null, label: 'Reset Demo',    desc: 'Clear all changes and restart', action: 'reset' },
      { href: null, label: 'Export Report', desc: 'Download impact summary (coming soon)', disabled: true },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/profile', label: 'Profile & Settings', desc: 'Preferences and account info' },
    ],
  },
]

export default function Nav() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  async function handleReset() {
    setResetting(true)
    setMenuOpen(false)
    await fetch('/api/reset', { method: 'POST' })
    setResetting(false)
    window.location.href = '/'
  }

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: 'white', borderBottom: '1px solid #E2E8F0',
      height: 56, display: 'flex', alignItems: 'center',
      padding: '0 24px', fontFamily: SANS,
    }}>
      {/* Logo */}
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, marginRight: 28 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.5px' }}>MerchAI</span>
        <span style={{
          background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 4,
          padding: '1px 7px', fontSize: 10, fontWeight: 700, color: '#F59E0B',
          fontFamily: MONO, letterSpacing: '1px',
        }}>LIVE</span>
      </Link>

      {/* Nav links */}
      <div style={{ display: 'flex', height: '100%' }}>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              textDecoration: 'none',
              padding: '0 16px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              fontSize: 14,
              fontWeight: isActive(link.href) ? 600 : 500,
              color: isActive(link.href) ? '#F59E0B' : '#64748B',
              borderBottom: `2px solid ${isActive(link.href) ? '#F59E0B' : 'transparent'}`,
              transition: 'color 0.15s',
            }}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* App menu */}
      <div style={{ position: 'relative', marginRight: 10 }}>
        <button
          onClick={() => { setMenuOpen(!menuOpen); setUserOpen(false) }}
          style={{
            background: menuOpen ? '#F8FAFC' : 'transparent',
            border: '1px solid #E2E8F0', borderRadius: 6,
            padding: '6px 12px', fontSize: 13, color: '#64748B',
            cursor: 'pointer', fontFamily: SANS,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span style={{ fontSize: 15 }}>≡</span> Menu
        </button>

        {menuOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setMenuOpen(false)} />
            <div style={{
              position: 'absolute', top: 42, right: 0, width: 280, zIndex: 200,
              background: 'white', border: '1px solid #E2E8F0', borderRadius: 10,
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden',
            }}>
              {APP_MENU_SECTIONS.map((section, si) => (
                <div key={section.title}>
                  {si > 0 && <div style={{ height: 1, background: '#F1F5F9' }} />}
                  <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {section.title}
                  </div>
                  {section.items.map((item) => {
                    if (item.disabled) {
                      return (
                        <div key={item.label} style={{ padding: '8px 16px', opacity: 0.4, cursor: 'not-allowed' }}>
                          <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 500 }}>{item.label}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{item.desc}</div>
                        </div>
                      )
                    }
                    if (item.action === 'reset') {
                      return (
                        <button
                          key={item.label}
                          onClick={handleReset}
                          disabled={resetting}
                          style={{
                            width: '100%', padding: '8px 16px', background: 'none', border: 'none',
                            textAlign: 'left', cursor: resetting ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 13, color: resetting ? '#94A3B8' : '#EF4444', fontWeight: 500 }}>
                            {resetting ? 'Resetting…' : item.label}
                          </div>
                          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{item.desc}</div>
                        </button>
                      )
                    }
                    return (
                      <Link
                        key={item.label}
                        href={item.href!}
                        onClick={() => setMenuOpen(false)}
                        style={{
                          display: 'block', padding: '8px 16px', textDecoration: 'none',
                          background: item.href && isActive(item.href) ? '#FFFBEB' : 'transparent',
                        }}
                      >
                        <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 500 }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{item.desc}</div>
                      </Link>
                    )
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* User avatar */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setUserOpen(!userOpen); setMenuOpen(false) }}
          style={{
            width: 34, height: 34, borderRadius: '50%',
            background: '#F59E0B', border: '2px solid #FCD34D',
            fontSize: 12, fontWeight: 700, color: 'white',
            cursor: 'pointer', fontFamily: SANS,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {DEMO_USER.initials}
        </button>

        {userOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setUserOpen(false)} />
            <div style={{
              position: 'absolute', top: 42, right: 0, width: 230, zIndex: 200,
              background: 'white', border: '1px solid #E2E8F0', borderRadius: 10,
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden',
            }}>
              {/* User info */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0,
                  }}>
                    {DEMO_USER.initials}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{DEMO_USER.name}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>{DEMO_USER.email}</div>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 7px' }}>
                    {DEMO_USER.role}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#F59E0B', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 4, padding: '2px 7px' }}>
                    {DEMO_USER.plan}
                  </span>
                </div>
              </div>
              {[
                { href: '/profile', label: '👤 Profile & Settings' },
                { href: '/agents',  label: '⚙ My Agents'          },
                { href: '/changes', label: '📋 Change History'     },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setUserOpen(false)}
                  style={{
                    display: 'block', padding: '10px 16px',
                    fontSize: 13, color: '#1E293B', textDecoration: 'none',
                    borderBottom: '1px solid #F1F5F9',
                  }}
                >
                  {item.label}
                </Link>
              ))}
              <button style={{
                width: '100%', padding: '10px 16px', background: 'none', border: 'none',
                textAlign: 'left', fontSize: 13, color: '#EF4444', cursor: 'pointer', fontFamily: SANS,
              }}>
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  )
}
