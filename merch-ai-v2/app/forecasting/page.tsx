'use client'

import { useState, useEffect, useCallback } from 'react'

interface ForecastRow {
  id: string
  sku_id: string
  product_name: string
  category: string
  forecast_units: number
  confidence_low: number
  confidence_high: number
  period: string
  method: string
  current_stock: number
  weeks_of_supply: number
  cost_price: number
  retail_price: number
}

interface ReplenishmentRow {
  id: string
  sku_id: string
  product_name: string
  category: string
  recommended_qty: number
  supplier: string
  lead_time_days: number
  moq: number
  estimated_cost: number
  urgency: string
  status: string
  created_at: string
}

const URGENCY_COLORS: Record<string, { color: string; bg: string }> = {
  urgent: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  normal: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  low:    { color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  draft:     { color: '#6366F1', bg: 'rgba(99,102,241,0.1)' },
  submitted: { color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
  cancelled: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
}

function WoSBadge({ wos }: { wos: number }) {
  const color = wos < 4 ? '#EF4444' : wos < 8 ? '#F59E0B' : '#10B981'
  const bg = wos < 4 ? 'rgba(239,68,68,0.1)' : wos < 8 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)'
  const label = wos < 4 ? 'Critical' : wos < 8 ? 'Low' : 'Healthy'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontWeight: 700, color, fontSize: 13 }}>{wos.toFixed(1)}w</span>
      <span style={{ fontSize: 10, color, background: bg, padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
        {label}
      </span>
    </div>
  )
}

export default function ForecastingPage() {
  const [forecasts, setForecasts] = useState<ForecastRow[]>([])
  const [orders, setOrders] = useState<ReplenishmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'forecasts' | 'replenishment'>('forecasts')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/forecasting')
      const json = await res.json()
      setForecasts(json.forecasts ?? [])
      setOrders(json.replenishmentOrders ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleOrderAction = async (id: string, action: 'submit' | 'cancel') => {
    setActioningId(id)
    try {
      await fetch('/api/forecasting/replenishment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      await fetchData()
    } finally {
      setActioningId(null)
    }

  }

  const urgentCount = orders.filter((o) => o.urgency === 'urgent' && o.status === 'draft').length
  const draftPOs = orders.filter((o) => o.status === 'draft').length
  const totalPOValue = orders
    .filter((o) => o.status === 'draft')
    .reduce((s, o) => s + o.estimated_cost, 0)

  return (
    <div>
      {/* Top bar */}
      <div style={{
        height: 56, background: '#FFFFFF', borderBottom: '1px solid #E2E8F0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: '#0F172A' }}>Demand & Replenishment</h1>
          <div style={{ fontSize: 12, color: '#64748B' }}>SKU-level forecasts with PO recommendations and size-curve logic</div>
        </div>
      </div>

      <div style={{ padding: '0 32px 32px' }}>
        {/* KPIs */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
          marginTop: 24, marginBottom: 24,
        }}>
          {[
            { label: 'SKUs Forecasted', value: forecasts.length, color: '#6366F1', icon: '🔮' },
            { label: 'Reorder Alerts', value: urgentCount, color: '#EF4444', icon: '🚨' },
            { label: 'Draft POs', value: draftPOs, color: '#F59E0B', icon: '📋' },
            { label: 'Total PO Value', value: `$${totalPOValue.toLocaleString()}`, color: '#10B981', icon: '💰' },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
              padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <span style={{ fontSize: 28 }}>{kpi.icon}</span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{kpi.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0',
          borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          marginBottom: 24, overflow: 'hidden',
        }}>
          <div style={{ padding: '0 20px', borderBottom: '1px solid #E2E8F0', display: 'flex' }}>
            {(['forecasts', 'replenishment'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '13px 16px', background: 'transparent', border: 'none',
                  borderBottom: activeTab === tab ? '2px solid #6366F1' : '2px solid transparent',
                  color: activeTab === tab ? '#6366F1' : '#64748B',
                  fontWeight: activeTab === tab ? 600 : 400,
                  fontSize: 13, cursor: 'pointer', textTransform: 'capitalize',
                }}
              >
                {tab === 'forecasts' ? `Demand Forecasts (${forecasts.length})` : `Replenishment Orders (${orders.length})`}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>Loading...</div>
          ) : activeTab === 'forecasts' ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    {['SKU', 'Product', 'Forecast Units (Q2)', 'Confidence Range', 'Current Stock', 'Weeks of Supply', 'Action'].map((h) => (
                      <th key={h} style={{
                        padding: '10px 14px', textAlign: 'left',
                        fontSize: 11, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {forecasts.map((f) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6366F1', fontWeight: 600 }}>
                          {f.sku_id}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', maxWidth: 200 }}>
                        <div style={{ fontWeight: 500, color: '#0F172A', fontSize: 12 }}>{f.product_name}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>{f.category}</div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontWeight: 700, color: '#0F172A', fontSize: 14 }}>{f.forecast_units}</span>
                        <span style={{ fontSize: 11, color: '#94A3B8' }}> units</span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748B', fontSize: 12 }}>
                        {f.confidence_low} – {f.confidence_high}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 500, color: '#0F172A' }}>
                        {f.current_stock}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <WoSBadge wos={f.weeks_of_supply} />
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {f.current_stock < f.forecast_units && (
                          <span style={{
                            padding: '3px 8px', background: 'rgba(239,68,68,0.08)',
                            color: '#EF4444', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          }}>
                            ⚠ Reorder Needed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, padding: 20 }}>
              {orders.map((order) => {
                const uc = URGENCY_COLORS[order.urgency] ?? URGENCY_COLORS.normal
                const sc = STATUS_COLORS[order.status] ?? STATUS_COLORS.draft
                const isActioning = actioningId === order.id

                return (
                  <div key={order.id} style={{
                    border: '1px solid #E2E8F0', borderRadius: 10, padding: 18,
                    background: order.urgency === 'urgent' ? 'rgba(239,68,68,0.02)' : '#FFFFFF',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6366F1', fontWeight: 600 }}>
                          {order.sku_id}
                        </span>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A', marginTop: 2 }}>
                          {order.product_name}
                        </div>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>{order.category}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 20, fontSize: 11,
                          fontWeight: 600, color: uc.color, background: uc.bg,
                        }}>{order.urgency}</span>
                        <span style={{
                          padding: '2px 8px', borderRadius: 20, fontSize: 11,
                          fontWeight: 600, color: sc.color, background: sc.bg,
                        }}>{order.status}</span>
                      </div>
                    </div>

                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                      padding: '12px 0', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9',
                      marginBottom: 12,
                    }}>
                      {[
                        { label: 'Qty Recommended', value: `${order.recommended_qty} units` },
                        { label: 'Supplier', value: order.supplier },
                        { label: 'Lead Time', value: `${order.lead_time_days} days` },
                        { label: 'Est. Cost', value: `$${order.estimated_cost.toLocaleString()}` },
                      ].map((item) => (
                        <div key={item.label}>
                          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, marginBottom: 2, textTransform: 'uppercase' }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{item.value}</div>
                        </div>
                      ))}
                    </div>

                    {order.status === 'draft' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => handleOrderAction(order.id, 'submit')}
                          disabled={isActioning}
                          style={{
                            background: '#10B981', color: '#fff', border: 'none',
                            borderRadius: 6, padding: '6px 14px', fontSize: 12,
                            fontWeight: 600, cursor: isActioning ? 'not-allowed' : 'pointer',
                            opacity: isActioning ? 0.6 : 1,
                          }}
                        >Submit PO</button>
                        <button
                          onClick={() => handleOrderAction(order.id, 'cancel')}
                          disabled={isActioning}
                          style={{
                            background: 'transparent', color: '#64748B', border: '1px solid #E2E8F0',
                            borderRadius: 6, padding: '6px 12px', fontSize: 12,
                            fontWeight: 600, cursor: isActioning ? 'not-allowed' : 'pointer',
                            opacity: isActioning ? 0.6 : 1,
                          }}
                        >Cancel</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Size curve callout */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          display: 'flex', gap: 16, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 24, flexShrink: 0 }}>📐</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A', marginBottom: 4 }}>
              Size Curve Allocation
            </div>
            <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6 }}>
              Size-curve logic distributes recommended PO quantities across sizes based on historical sell-through by size.
              Configure per-category size curves in Settings → Agent Configuration to activate this feature.
              Currently forecasts are at the SKU level; size breakdowns require historical size-level sales data.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
