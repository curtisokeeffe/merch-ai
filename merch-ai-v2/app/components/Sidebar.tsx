'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/',             label: 'Command Center',  icon: '⚡' },
  { href: '/performance',  label: 'Daily Signals',   icon: '📊' },
  { href: '/content',      label: 'Product Content', icon: '✍️' },
  { href: '/pricing',      label: 'Dynamic Pricing', icon: '💲' },
  { href: '/forecasting',  label: 'Forecasting',     icon: '🔮' },
  { href: '/promotions',   label: 'Promotions',      icon: '🏷️' },
]

function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
  const pathname = usePathname()
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <Link href={href} style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 16px',
        margin: '1px 8px',
        borderRadius: 8,
        color: active ? '#FFFFFF' : '#94A3B8',
        background: active ? 'rgba(99,102,241,0.18)' : 'transparent',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}>
        <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{icon}</span>
        <span>{label}</span>
        {active && (
          <div style={{
            marginLeft: 'auto',
            width: 4, height: 4, borderRadius: '50%',
            background: '#6366F1',
          }} />
        )}
      </div>
    </Link>
  )
}

export default function Sidebar() {
  return (
    <aside style={{
      width: 220,
      minHeight: '100vh',
      background: '#1E2D40',
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
    }}>
      {/* Brand */}
      <div style={{
        padding: '20px 20px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32,
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0,
          }}>
            ⚡
          </div>
          <div>
            <div style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>
              MerchAI
            </div>
            <div style={{
              color: '#6366F1', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              v2 Platform
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 0' }}>
        <div style={{
          padding: '4px 16px 8px', fontSize: 10, fontWeight: 600,
          color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          Modules
        </div>
        {navItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 16px' }} />

      {/* Settings */}
      <div style={{ padding: '12px 0' }}>
        <NavItem href="/settings" label="Settings" icon="⚙️" />
      </div>

      {/* User section */}
      <div style={{
        padding: '12px 16px 16px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32,
            background: 'linear-gradient(135deg, #10B981, #059669)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: '#fff', fontWeight: 600, flexShrink: 0,
          }}>
            MR
          </div>
          <div>
            <div style={{ color: '#E2E8F0', fontSize: 12, fontWeight: 500 }}>Merch Team</div>
            <div style={{ color: '#64748B', fontSize: 11 }}>v2-platform</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
