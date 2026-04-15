import type { Metadata } from 'next'
import './globals.css'
import Sidebar from './components/Sidebar'

export const metadata: Metadata = {
  title: 'MerchAI v2 — Merchandising Intelligence Platform',
  description: 'AI-powered merchandising intelligence for mid-market fashion retail',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <Sidebar />
          <main style={{
            marginLeft: 220,
            flex: 1,
            minHeight: '100vh',
            background: '#F0F4FF',
          }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
