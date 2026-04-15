'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode } from 'react'

const SANS = "'DM Sans', sans-serif"

const SECTIONS = [
  {
    href: '/settings/connections',
    label: 'Connections',
    icon: '🔗',
    desc: 'Platform integrations',
    disabled: false,
  },
  {
    href: '/settings/agent',
    label: 'Agent Defaults',
    icon: '⚙️',
    desc: 'Cooldowns & thresholds',
    disabled: true,
  },
  {
    href: '/settings/notifications',
    label: 'Notifications',
    icon: '🔔',
    desc: 'Alerts and reports',
    disabled: true,
  },
]

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div style={{
      paddingTop: 56,
      minHeight: '100vh',
      fontFamily: SANS,
      background: '#F8FAFC',
      display: 'flex',
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: 'white',
        borderRight: '1px solid #E2E8F0',
        flexShrink: 0,
        minHeight: 'calc(100vh - 56px)',
        paddingTop: 20,
      }}>
        <div style={{
          padding: '0 16px 12px',
          fontSize: 10,
          fontWeight: 700,
          color: '#94A3B8',
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}>
          Settings
        </div>

        {SECTIONS.map(section => {
          const isActive = pathname === section.href || pathname.startsWith(section.href + '/')
          if (section.disabled) {
            return (
              <div
                key={section.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 16px', opacity: 0.4, cursor: 'not-allowed',
                }}
              >
                <span style={{ fontSize: 16 }}>{section.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>{section.label}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>{section.desc}</div>
                </div>
              </div>
            )
          }
          return (
            <Link
              key={section.href}
              href={section.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 16px', textDecoration: 'none',
                background: isActive ? '#FFFBEB' : 'transparent',
                borderRight: isActive ? '2px solid #F59E0B' : '2px solid transparent',
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{section.icon}</span>
              <div>
                <div style={{
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#D97706' : '#1E293B',
                }}>
                  {section.label}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>{section.desc}</div>
              </div>
            </Link>
          )
        })}
      </aside>

      {/* Content */}
      <main style={{ flex: 1, minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}
