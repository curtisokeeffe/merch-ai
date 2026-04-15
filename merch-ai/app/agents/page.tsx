'use client'

import { useEffect, useRef, useState } from 'react'
import type { ActionCard, Mutation, Severity } from '@/lib/insights'
import type { ProductRow } from '@/lib/db'

// ─── Types ─────────────────────────────────────────────────────────────────────

type CardStatus = 'pending' | 'approved' | 'dismissed'
type Message = { role: 'user' | 'assistant'; content: string }

interface SkuImpact {
  sku_id: string; name: string; category: string
  before: { price: number; margin_pct: number; markdown_pct: number; status: string; inventory_value: number; sell_through_rate: number; current_stock: number }
  current: { price: number; margin_pct: number; markdown_pct: number; status: string; inventory_value: number; sell_through_rate: number; current_stock: number }
  deltas: { price: { rel: number; formatted: string; dir: string }; margin: { abs: number; formatted: string; dir: string }; inventory_value: { formatted: string; dir: string }; sell_through: { abs: number; formatted: string; dir: string }; stock: { abs: number; formatted: string; dir: string } }
}
interface ImpactData {
  title: string; approvedAt: string; skuCount: number; fetchedAt: string
  skuImpacts: SkuImpact[]
  summary: { inventoryValue: { before: number; current: number; delta: number }; avgPrice: { before: number; current: number; delta: number }; avgSellThrough: { before: number; current: number; delta: number } }
}
type PageView = 'all' | 'agents' | 'create' | 'data'
type SortKey = 'severity' | 'agent' | 'mutations' | 'skus'

// ─── Constants ─────────────────────────────────────────────────────────────────

const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

const SEV_COLOR: Record<Severity, string> = { red: '#EF4444', amber: '#F59E0B', green: '#22C55E' }
const SEV_LABEL: Record<Severity, string> = { red: 'Critical', amber: 'Watch', green: 'Signal' }
const SEV_ORDER: Record<Severity, number> = { red: 0, amber: 1, green: 2 }

const AGENT_DEFS = [
  { name: 'Markdown Agent',   color: '#EF4444', light: '#FEF2F2', border: '#FCA5A5', icon: '📉', desc: 'Identifies slow-movers and markdown opportunities across your catalog.' },
  { name: 'Pricing Agent',    color: '#F59E0B', light: '#FFFBEB', border: '#FCD34D', icon: '💰', desc: 'Optimises price tiers, margin recovery, and strategic pricing moves.' },
  { name: 'Assortment Agent', color: '#22C55E', light: '#F0FDF4', border: '#86EFAC', icon: '📦', desc: 'Manages product mix, bundling strategies, and inventory depth.' },
  { name: 'Risk Agent',       color: '#8B5CF6', light: '#F5F3FF', border: '#C4B5FD', icon: '🛡',  desc: 'Monitors portfolio concentration risk and diversification health.' },
]

const AGENT_SUGGESTIONS = [
  { name: 'Stockout Prevention', color: '#F97316', light: '#FFF7ED', border: '#FDBA74', icon: '⚠️', focus: 'Alert when fast-moving SKUs drop below 3 weeks of supply. Prevent lost revenue from inventory gaps before they happen.', reason: 'Fast-mover signals detected — 3 SKUs under 4 wks supply' },
  { name: 'Bundle Architect',    color: '#14B8A6', light: '#F0FDFA', border: '#5EEAD4', icon: '🎁', focus: 'Find multi-buy patterns across categories and formalise bundle pricing. Target repeat-purchase and attach-rate opportunities.', reason: 'Multi-unit transaction signals in Beauty & Electronics' },
  { name: 'Seasonal Rotation',   color: '#6366F1', light: '#EEF2FF', border: '#A5B4FC', icon: '🔄', focus: 'Monitor sell-through velocity against seasonal plan. Trigger end-of-season clearance before excess builds up further.', reason: 'Excess inventory build-up in Clothing category' },
]

const ICON_OPTS = ['📊', '🎯', '💡', '🔍', '📈', '🚨', '⚡', '🧩', '🔧', '💎', '🏷', '📦', '🎁', '🔄']
const COLOR_OPTS = [
  { color: '#3B82F6', light: '#EFF6FF', border: '#93C5FD', name: 'blue' },
  { color: '#8B5CF6', light: '#F5F3FF', border: '#C4B5FD', name: 'purple' },
  { color: '#EC4899', light: '#FDF2F8', border: '#F9A8D4', name: 'pink' },
  { color: '#14B8A6', light: '#F0FDFA', border: '#5EEAD4', name: 'teal' },
  { color: '#F97316', light: '#FFF7ED', border: '#FDBA74', name: 'orange' },
  { color: '#6366F1', light: '#EEF2FF', border: '#A5B4FC', name: 'indigo' },
]

const COLOR_BY_NAME: Record<string, { color: string; light: string; border: string }> = Object.fromEntries(
  COLOR_OPTS.map((c) => [c.name, { color: c.color, light: c.light, border: c.border }])
)

function parseAgentTemplate(text: string): { name: string; focus: string; icon: string; color: string; light: string; border: string } | null {
  const match = text.match(/<agent_template>([\s\S]*?)<\/agent_template>/)
  if (!match) return null
  try {
    const data = JSON.parse(match[1].trim())
    const colorDef = COLOR_BY_NAME[data.color] ?? COLOR_BY_NAME['orange']
    return {
      name: data.name || '',
      focus: data.focus || '',
      icon: data.icon || '🚨',
      ...colorDef,
    }
  } catch { return null }
}

function stripTemplate(text: string): string {
  return text.replace(/<agent_template>[\s\S]*?<\/agent_template>/g, '').trim()
}

function agentDef(name: string) { return AGENT_DEFS.find((a) => a.name === name) ?? AGENT_DEFS[1] }

function getStoredConfigs(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem('agentConfigs') || '{}') } catch { return {} }
}
function storeConfig(name: string, value: string) {
  const c = getStoredConfigs(); c[name] = value
  localStorage.setItem('agentConfigs', JSON.stringify(c))
}
function clearConfig(name: string) {
  const c = getStoredConfigs(); delete c[name]
  localStorage.setItem('agentConfigs', JSON.stringify(c))
}

type CustomAgent = { name: string; focus: string; icon: string; color: string; light: string; border: string; category: string }
function getCustomAgents(): CustomAgent[] {
  if (typeof window === 'undefined') return []
  try {
    const c = JSON.parse(localStorage.getItem('agentConfigs') || '{}')
    return Object.entries(c)
      .filter(([k]) => k.startsWith('__agent__'))
      .map(([, v]) => {
        try { return JSON.parse(v as string) as CustomAgent } catch { return null }
      })
      .filter(Boolean) as CustomAgent[]
  } catch { return [] }
}
function deleteCustomAgent(name: string) {
  const c = getStoredConfigs()
  delete c[`__agent__${name}`]
  localStorage.setItem('agentConfigs', JSON.stringify(c))
}

// ─── Mutation helpers ──────────────────────────────────────────────────────────

function mutationDisplay(m: Mutation): { label: string; editValue: number | null; displayValue: string; unit: string } {
  if (m.field === 'retail_price' && m.operation === 'multiply') {
    const v = m.value as number
    const pct = Math.round(Math.abs(1 - v) * 100)
    return { label: 'Price', editValue: pct, displayValue: '', unit: v < 1 ? '% markdown' : '% increase' }
  }
  if (m.field === 'markdown_pct') {
    return { label: 'Markdown %', editValue: m.value as number, displayValue: '', unit: '%' }
  }
  if (m.field === 'status') {
    return { label: 'Status', editValue: null, displayValue: String(m.value).replace(/_/g, ' '), unit: '' }
  }
  return { label: m.field.replace(/_/g, ' '), editValue: typeof m.value === 'number' ? (m.value as number) : null, displayValue: String(m.value), unit: '' }
}

function mutationNewValue(m: Mutation, editedPct: number): number {
  if (m.field === 'retail_price' && m.operation === 'multiply') {
    return (m.value as number) < 1 ? 1 - editedPct / 100 : 1 + editedPct / 100
  }
  return editedPct
}

// ─── SignalCard ─────────────────────────────────────────────────────────────────

interface SignalCardProps {
  card: ActionCard
  status: CardStatus
  isApproving: boolean
  chatOpen: boolean
  chatMessages: Message[]
  chatInput: string
  chatStreaming: boolean
  agentColor: string
  agentLight: string
  agentBorder: string
  previewOpen: boolean
  mutations: Mutation[]
  onTogglePreview: () => void
  onMutationValueChange: (index: number, newValue: number) => void
  actionId?: string
  impactData?: ImpactData | null
  impactLoading?: boolean
  impactOpen?: boolean
  onToggleImpact?: () => void
  onApprove: () => void
  onDismiss: () => void
  onToggleChat: () => void
  onChatInputChange: (v: string) => void
  onChatSend: (text: string) => void
}

function DeltaBadge({ dir, formatted }: { dir: string; formatted: string }) {
  const color = dir === 'up' ? '#22C55E' : dir === 'down' ? '#EF4444' : '#94A3B8'
  const bg   = dir === 'up' ? '#F0FDF4' : dir === 'down' ? '#FEF2F2' : '#F8FAFC'
  return <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 5, padding: '1px 6px' }}>{formatted}</span>
}

function SignalCard({ card, status, isApproving, chatOpen, chatMessages, chatInput, chatStreaming, agentColor, agentLight, agentBorder, previewOpen, mutations, onTogglePreview, onMutationValueChange, actionId, impactData, impactLoading, impactOpen, onToggleImpact, onApprove, onDismiss, onToggleChat, onChatInputChange, onChatSend }: SignalCardProps) {
  const isDone = status !== 'pending'
  const chatBottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])
  const adef = agentDef(card.agentSource)

  return (
    <div style={{
      background: 'white', borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${status === 'approved' ? '#86EFAC' : status === 'dismissed' ? '#E2E8F0' : chatOpen ? agentBorder : '#E2E8F0'}`,
      opacity: status === 'dismissed' ? 0.5 : 1,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', transition: 'border-color 0.15s',
    }}>
      <div style={{ padding: '16px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: isDone ? '#CBD5E1' : SEV_COLOR[card.severity], boxShadow: isDone ? 'none' : `0 0 5px ${SEV_COLOR[card.severity]}88` }} />
            <span style={{ fontSize: 11, color: '#94A3B8' }}>{SEV_LABEL[card.severity]}</span>
            <span style={{ fontSize: 10, background: adef.light, border: `1px solid ${adef.border}`, color: adef.color, borderRadius: 10, padding: '1px 7px', fontWeight: 600, marginLeft: 2 }}>{adef.icon} {card.agentSource.replace(' Agent', '')}</span>
          </div>
          {status === 'approved' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 600 }}>✓ Approved</span>
              {onToggleImpact && (
                <button
                  onClick={onToggleImpact}
                  style={{ fontSize: 11, fontWeight: 600, color: impactOpen ? '#6366F1' : '#94A3B8', background: impactOpen ? '#EEF2FF' : 'transparent', border: `1px solid ${impactOpen ? '#A5B4FC' : '#E2E8F0'}`, borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontFamily: SANS }}
                >
                  {impactLoading ? '⟳ Loading…' : '📊 Impact'}
                </button>
              )}
            </div>
          )}
          {status === 'dismissed' && <span style={{ fontSize: 12, color: '#CBD5E1' }}>Dismissed</span>}
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: isDone ? '#94A3B8' : '#1E293B', lineHeight: 1.4, marginBottom: 8 }}>{card.title}</h3>
        <p style={{ fontSize: 13, color: '#64748B', marginBottom: 12, lineHeight: 1.5 }}>{card.impact}</p>

        {/* Steps toggle */}
        {!isDone && (
          <button
            onClick={onTogglePreview}
            style={{ fontSize: 11, color: previewOpen ? agentColor : '#94A3B8', fontFamily: MONO, marginBottom: previewOpen ? 8 : 12, background: previewOpen ? agentLight : '#F8FAFC', border: `1px solid ${previewOpen ? agentBorder : '#E2E8F0'}`, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <span style={{ fontSize: 9 }}>{previewOpen ? '▾' : '▸'}</span>
            {mutations.length} steps · {card.affectedSkus.length} SKUs
          </button>
        )}

        {/* Execution plan panel */}
        {!isDone && previewOpen && (
          <div style={{ marginBottom: 12, background: '#F8FAFC', border: `1px solid ${agentBorder}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '7px 12px', borderBottom: '1px solid #E2E8F0', fontSize: 10, fontWeight: 700, color: agentColor, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Execution Plan</span>
              <span style={{ color: '#94A3B8', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>Edit values before approving</span>
            </div>
            {card.affectedSkus.map((sku) => {
              const skuMuts = mutations.map((m, i) => ({ ...m, _idx: i })).filter((m) => m.sku_id === sku)
              return (
                <div key={sku} style={{ padding: '8px 12px', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: agentColor, fontWeight: 700, marginBottom: 6 }}>{sku}</div>
                  {skuMuts.map(({ _idx, ...m }) => {
                    const { label, editValue, displayValue, unit } = mutationDisplay(m)
                    return (
                      <div key={_idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, fontSize: 12 }}>
                        <span style={{ color: '#94A3B8', width: 84, flexShrink: 0, fontSize: 11 }}>{label}</span>
                        <span style={{ color: '#CBD5E1', fontSize: 10 }}>→</span>
                        {editValue !== null ? (
                          <>
                            <input
                              type="number"
                              defaultValue={editValue}
                              onChange={(e) => {
                                const n = parseFloat(e.target.value)
                                if (!isNaN(n)) onMutationValueChange(_idx, mutationNewValue(m, n))
                              }}
                              style={{ width: 54, border: `1px solid ${agentBorder}`, borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: MONO, color: '#1E293B', background: 'white' }}
                            />
                            <span style={{ fontSize: 11, color: '#64748B' }}>{unit}</span>
                          </>
                        ) : (
                          <span style={{ fontFamily: MONO, fontSize: 11, color: '#64748B' }}>{displayValue}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* Action buttons */}
        {!isDone && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button onClick={onApprove} disabled={isApproving} style={{ background: isApproving ? '#F8FAFC' : '#F0FDF4', border: `1px solid ${isApproving ? '#E2E8F0' : '#86EFAC'}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: isApproving ? '#CBD5E1' : '#22C55E', cursor: isApproving ? 'not-allowed' : 'pointer', fontFamily: SANS }}>
              {isApproving ? 'Applying…' : '✓ Approve'}
            </button>
            <button onClick={onDismiss} style={{ background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 14px', fontSize: 12, color: '#94A3B8', cursor: 'pointer', fontFamily: SANS }}>
              Dismiss
            </button>
            <button onClick={onToggleChat} style={{ background: chatOpen ? agentLight : 'transparent', border: `1px solid ${chatOpen ? agentBorder : '#E2E8F0'}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: chatOpen ? 600 : 400, color: chatOpen ? agentColor : '#94A3B8', cursor: 'pointer', fontFamily: SANS, marginLeft: 'auto' }}>
              {chatOpen ? 'Close' : 'Ask Why →'}
            </button>
          </div>
        )}
      </div>

      {/* Impact panel */}
      {impactOpen && (
        <div style={{ borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6366F1' }}>📊 Impact Report</span>
            {impactData && (
              <span style={{ fontSize: 11, color: '#94A3B8' }}>
                · refreshed {new Date(impactData.fetchedAt).toLocaleTimeString()}
              </span>
            )}
            <button onClick={onToggleImpact} style={{ marginLeft: 'auto', fontSize: 11, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>

          {impactLoading && (
            <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12, color: '#94A3B8' }}>Fetching live data…</div>
          )}

          {impactData && !impactLoading && (
            <div style={{ padding: '10px 14px' }}>
              {/* Summary row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'Inventory Value', val: impactData.summary.inventoryValue.delta, fmt: (n: number) => `${n >= 0 ? '+' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
                  { label: 'Avg Price', val: impactData.summary.avgPrice.delta, fmt: (n: number) => `${n >= 0 ? '+' : ''}$${Math.abs(n).toFixed(2)}` },
                  { label: 'Sell-Through', val: impactData.summary.avgSellThrough.delta, fmt: (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}pts` },
                ].map(({ label, val, fmt }) => (
                  <div key={label} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 7, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: val === 0 ? '#94A3B8' : val > 0 ? '#22C55E' : '#EF4444' }}>{fmt(val)}</div>
                  </div>
                ))}
              </div>

              {/* Per-SKU breakdown */}
              {impactData.skuImpacts.map((sku) => (
                <div key={sku.sku_id} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: '#6366F1' }}>{sku.sku_id}</span>
                    <span style={{ fontSize: 12, color: '#64748B' }}>{sku.name}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    {[
                      { label: 'Price', before: `$${sku.before.price.toFixed(2)}`, after: `$${sku.current.price.toFixed(2)}`, delta: sku.deltas.price },
                      { label: 'Margin', before: `${sku.before.margin_pct.toFixed(1)}%`, after: `${sku.current.margin_pct.toFixed(1)}%`, delta: sku.deltas.margin },
                      { label: 'Status', before: sku.before.status, after: sku.current.status, delta: null },
                      { label: 'Sell-Through', before: `${sku.before.sell_through_rate.toFixed(0)}%`, after: `${sku.current.sell_through_rate.toFixed(0)}%`, delta: sku.deltas.sell_through },
                      { label: 'Stock', before: `${sku.before.current_stock}u`, after: `${sku.current.current_stock}u`, delta: sku.deltas.stock },
                      { label: 'Inv. Value', before: `$${sku.before.inventory_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, after: `$${sku.current.inventory_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, delta: sku.deltas.inventory_value },
                    ].map(({ label, before, after, delta: d }) => (
                      <div key={label} style={{ fontSize: 11 }}>
                        <div style={{ color: '#94A3B8', fontWeight: 600, marginBottom: 2 }}>{label}</div>
                        <div style={{ color: '#64748B' }}><span style={{ textDecoration: 'line-through', opacity: 0.5 }}>{before}</span> → <span style={{ fontWeight: 600, color: '#1E293B' }}>{after}</span></div>
                        {d && <DeltaBadge dir={d.dir} formatted={d.formatted} />}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button
                onClick={onToggleImpact}
                style={{ width: '100%', marginTop: 4, fontSize: 11, color: '#94A3B8', background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, padding: '5px', cursor: 'pointer', fontFamily: SANS }}
              >
                ↻ Refresh live metrics
              </button>
            </div>
          )}

          {!impactData && !impactLoading && (
            <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 12, color: '#94A3B8' }}>
              No snapshot data. Reset the demo and re-approve to enable tracking.
            </div>
          )}
        </div>
      )}

      {/* Ask Why chat panel */}
      {chatOpen && (
        <div style={{ borderTop: `1px solid ${agentBorder}`, background: agentLight }}>
          <div style={{ maxHeight: 200, overflowY: 'auto', padding: '12px 14px' }}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 8, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '90%', background: msg.role === 'user' ? agentColor : 'white', border: msg.role === 'assistant' ? '1px solid #E2E8F0' : 'none', borderRadius: 7, padding: '7px 11px', fontSize: 12, color: msg.role === 'user' ? 'white' : '#1E293B', lineHeight: 1.5 }}>
                  {msg.content || (chatStreaming && i === chatMessages.length - 1 ? <span style={{ color: agentColor }}>▍</span> : null)}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
          <div style={{ padding: '8px 14px', borderTop: `1px solid ${agentBorder}`, display: 'flex', gap: 7 }}>
            <input value={chatInput} onChange={(e) => onChatInputChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && chatInput.trim() && !chatStreaming) { e.preventDefault(); onChatSend(chatInput) } }} placeholder="Follow up…" disabled={chatStreaming} style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: SANS, background: chatStreaming ? '#F8FAFC' : 'white' }} />
            <button onClick={() => onChatSend(chatInput)} disabled={chatStreaming || !chatInput.trim()} style={{ background: chatStreaming || !chatInput.trim() ? '#F1F5F9' : agentColor, border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 700, color: chatStreaming || !chatInput.trim() ? '#94A3B8' : 'white', cursor: chatStreaming || !chatInput.trim() ? 'not-allowed' : 'pointer' }}>→</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function AgentsPage() {

  // ── Data ────────────────────────────────────────────────────────────────────
  const [cards, setCards] = useState<ActionCard[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [cardStatus, setCardStatus] = useState<Record<string, CardStatus>>({})
  const [approving, setApproving] = useState<Record<string, boolean>>({})

  // ── Navigation ──────────────────────────────────────────────────────────────
  const [pageView, setPageView] = useState<PageView>('all')
  const [selectedAgent, setSelectedAgent] = useState(AGENT_DEFS[0].name)
  const [activeSection, setActiveSection] = useState<'signals' | 'configure' | 'query'>('signals')

  // ── All signals filters ──────────────────────────────────────────────────────
  const [filterAgent, setFilterAgent] = useState('all')
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<CardStatus | 'all'>('all')
  const [sortBy, setSortBy] = useState<SortKey>('severity')

  // ── Card interactions ────────────────────────────────────────────────────────
  const [cardChatOpen, setCardChatOpen] = useState<string | null>(null)
  const [cardChats, setCardChats] = useState<Record<string, Message[]>>({})
  const [cardChatInput, setCardChatInput] = useState<Record<string, string>>({})
  const [cardChatStreaming, setCardChatStreaming] = useState<Record<string, boolean>>({})
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({})
  const [cardMutationOverrides, setCardMutationOverrides] = useState<Record<string, Mutation[]>>({})

  // ── Configure ────────────────────────────────────────────────────────────────
  const [agentConfigs, setAgentConfigs] = useState<Record<string, string>>({})
  const [configChat, setConfigChat] = useState<Record<string, Message[]>>({})
  const [configInput, setConfigInput] = useState('')
  const [configStreaming, setConfigStreaming] = useState(false)
  const [revertConfirm, setRevertConfirm] = useState(false)

  // ── Query ────────────────────────────────────────────────────────────────────
  const [queryChat, setQueryChat] = useState<Record<string, Message[]>>({})
  const [queryInput, setQueryInput] = useState('')
  const [queryStreaming, setQueryStreaming] = useState(false)

  // ── Create agent ─────────────────────────────────────────────────────────────
  const [createChat, setCreateChat] = useState<Message[]>([])
  const [createInput, setCreateInput] = useState('')
  const [createStreaming, setCreateStreaming] = useState(false)
  const [newAgent, setNewAgent] = useState({ name: '', focus: '', icon: '📊', color: '#3B82F6', light: '#EFF6FF', border: '#93C5FD', category: 'Markdown', customCategory: '' })
  const [customCategoryInput, setCustomCategoryInput] = useState(false)
  const [createSaved, setCreateSaved] = useState(false)
  const [templateReady, setTemplateReady] = useState(false)
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([])
  const [customSignals, setCustomSignals] = useState<Record<string, ActionCard[]>>({})
  const [generatingSignals, setGeneratingSignals] = useState<Record<string, boolean>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // ── Impact tracking ──────────────────────────────────────────────────────────
  const [approvedActionIds, setApprovedActionIds] = useState<Record<string, string>>({})
  const [impactOpen, setImpactOpen] = useState<Record<string, boolean>>({})
  const [impactData, setImpactData] = useState<Record<string, ImpactData>>({})
  const [impactLoading, setImpactLoading] = useState<Record<string, boolean>>({})

  // ── Data view ────────────────────────────────────────────────────────────────
  const [dataCategory, setDataCategory] = useState<string | null>(null)
  const [dataPage, setDataPage] = useState(1)
  const [dataLimit] = useState(50)
  const [dataProducts, setDataProducts] = useState<ProductRow[]>([])
  const [dataCategories, setDataCategories] = useState<string[]>([])
  const [dataTotal, setDataTotal] = useState(0)
  const [dataPages, setDataPages] = useState(0)
  const [dataLoading, setDataLoading] = useState(false)

  const configBottomRef = useRef<HTMLDivElement>(null)
  const queryBottomRef = useRef<HTMLDivElement>(null)
  const createBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/insights').then((r) => r.json()).then((data) => {
      if (data.cards) setCards(data.cards)
      setLoading(false)
    }).catch(() => setLoading(false))
    setAgentConfigs(getStoredConfigs())
    setCustomAgents(getCustomAgents())
  }, [])

  useEffect(() => { configBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [configChat])
  useEffect(() => { queryBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [queryChat])
  useEffect(() => { createBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [createChat])
  useEffect(() => { setRevertConfirm(false); setConfigInput('') }, [selectedAgent])
  useEffect(() => { if (pageView === 'data' && dataProducts.length === 0) fetchDataProducts(null, 1) }, [pageView])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getCardMutations(card: ActionCard): Mutation[] {
    return cardMutationOverrides[card.id] ?? card.mutations
  }

  function getFilteredSorted(): ActionCard[] {
    if (!cards) return []
    let list = [...cards]
    if (filterAgent !== 'all') list = list.filter((c) => c.agentSource === filterAgent)
    if (filterSeverity !== 'all') list = list.filter((c) => c.severity === filterSeverity)
    if (filterStatus !== 'all') list = list.filter((c) => (cardStatus[c.id] || 'pending') === filterStatus)
    list.sort((a, b) => {
      if (sortBy === 'severity') return SEV_ORDER[a.severity] - SEV_ORDER[b.severity]
      if (sortBy === 'agent') return a.agentSource.localeCompare(b.agentSource)
      if (sortBy === 'mutations') return b.mutations.length - a.mutations.length
      if (sortBy === 'skus') return b.affectedSkus.length - a.affectedSkus.length
      return 0
    })
    return list
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleApprove(card: ActionCard) {
    setApproving((p) => ({ ...p, [card.id]: true }))
    const mutations = getCardMutations(card)
    try {
      const res = await fetch('/api/actions/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card: { ...card, mutations } }) })
      const data = await res.json()
      if (data.ok) {
        setCardStatus((p) => ({ ...p, [card.id]: 'approved' }))
        if (data.actionId) setApprovedActionIds((p) => ({ ...p, [card.id]: data.actionId }))
      }
    } finally {
      setApproving((p) => ({ ...p, [card.id]: false }))
    }
  }

  async function fetchImpact(cardId: string, actionId: string) {
    setImpactLoading((p) => ({ ...p, [cardId]: true }))
    try {
      const res = await fetch(`/api/impact?actionId=${encodeURIComponent(actionId)}`)
      const data = await res.json()
      if (!data.error) setImpactData((p) => ({ ...p, [cardId]: data }))
    } catch (err) {
      console.error('fetchImpact error:', err)
    } finally {
      setImpactLoading((p) => ({ ...p, [cardId]: false }))
    }
  }

  async function fetchDataProducts(category?: string | null, page: number = 1) {
    setDataLoading(true)
    try {
      const offset = (page - 1) * dataLimit
      const params = new URLSearchParams({ limit: String(dataLimit), offset: String(offset) })
      if (category) params.append('category', category)
      const res = await fetch(`/api/products?${params}`)
      const data = await res.json()
      setDataProducts(data.products || [])
      setDataCategories(data.categories || [])
      setDataTotal(data.total || 0)
      setDataPages(data.pages || 0)
      setDataPage(page)
    } catch (err) {
      console.error('fetchDataProducts error:', err)
    } finally {
      setDataLoading(false)
    }
  }

  async function handleDismiss(card: ActionCard) {
    await fetch('/api/actions/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card }) })
    setCardStatus((p) => ({ ...p, [card.id]: 'dismissed' }))
  }

  async function sendCardChat(cardId: string, card: ActionCard, userText: string) {
    const prev = cardChats[cardId] || []
    const newMessages: Message[] = [...prev, { role: 'user', content: userText }]
    setCardChats((p) => ({ ...p, [cardId]: [...newMessages, { role: 'assistant', content: '' }] }))
    setCardChatStreaming((p) => ({ ...p, [cardId]: true }))
    setCardChatInput((p) => ({ ...p, [cardId]: '' }))
    const res = await fetch('/api/card-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card, messages: newMessages, agentConfig: agentConfigs[card.agentSource] }) })
    const reader = res.body!.getReader(); const dec = new TextDecoder(); let text = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      text += dec.decode(value, { stream: true })
      setCardChats((p) => { const msgs = [...(p[cardId] || [])]; msgs[msgs.length - 1] = { role: 'assistant', content: text }; return { ...p, [cardId]: msgs } })
    }
    setCardChatStreaming((p) => ({ ...p, [cardId]: false }))
  }

  async function sendConfigChat(text: string) {
    if (!text.trim()) return
    const prev = configChat[selectedAgent] || []
    const newMessages: Message[] = [...prev, { role: 'user', content: text }]
    setConfigChat((p) => ({ ...p, [selectedAgent]: [...newMessages, { role: 'assistant', content: '' }] }))
    setConfigInput('')
    setConfigStreaming(true)
    const res = await fetch('/api/agent-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentName: selectedAgent, messages: newMessages, currentConfig: agentConfigs[selectedAgent] }) })
    const reader = res.body!.getReader(); const dec = new TextDecoder(); let responseText = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      responseText += dec.decode(value, { stream: true })
      setConfigChat((p) => { const msgs = [...(p[selectedAgent] || [])]; msgs[msgs.length - 1] = { role: 'assistant', content: responseText }; return { ...p, [selectedAgent]: msgs } })
    }
    storeConfig(selectedAgent, text)
    setAgentConfigs((p) => ({ ...p, [selectedAgent]: text }))
    setConfigStreaming(false)
  }

  function handleRevert() {
    if (!revertConfirm) { setRevertConfirm(true); return }
    clearConfig(selectedAgent)
    setAgentConfigs((p) => { const next = { ...p }; delete next[selectedAgent]; return next })
    setConfigChat((p) => { const next = { ...p }; delete next[selectedAgent]; return next })
    setConfigInput('')
    setRevertConfirm(false)
  }

  async function sendQueryChat(text: string) {
    if (!text.trim() || queryStreaming) return
    const prev = queryChat[selectedAgent] || []
    const newMessages: Message[] = [...prev, { role: 'user', content: text }]
    setQueryChat((p) => ({ ...p, [selectedAgent]: [...newMessages, { role: 'assistant', content: '' }] }))
    setQueryInput('')
    setQueryStreaming(true)
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: newMessages }) })
    const reader = res.body!.getReader(); const dec = new TextDecoder(); let responseText = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      responseText += dec.decode(value, { stream: true })
      setQueryChat((p) => { const msgs = [...(p[selectedAgent] || [])]; msgs[msgs.length - 1] = { role: 'assistant', content: responseText }; return { ...p, [selectedAgent]: msgs } })
    }
    setQueryStreaming(false)
  }

  async function sendCreateChat(text: string) {
    if (!text.trim() || createStreaming) return
    const newMessages: Message[] = [...createChat, { role: 'user', content: text }]
    setCreateChat([...newMessages, { role: 'assistant', content: '' }])
    setCreateInput('')
    setCreateStreaming(true)
    setTemplateReady(false)
    const res = await fetch('/api/create-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: newMessages }) })
    const reader = res.body!.getReader(); const dec = new TextDecoder(); let fullText = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      fullText += dec.decode(value, { stream: true })
      // Strip the template block from display, show only conversational text
      setCreateChat((msgs) => { const next = [...msgs]; next[next.length - 1] = { role: 'assistant', content: stripTemplate(fullText) }; return next })
    }
    // Parse template and auto-fill form
    const template = parseAgentTemplate(fullText)
    if (template) {
      setNewAgent((p) => ({ ...p, ...template }))
      setTemplateReady(true)
    }
    setCreateStreaming(false)
  }

  function handleDeleteAgent(name: string) {
    if (deleteConfirm !== name) { setDeleteConfirm(name); return }
    deleteCustomAgent(name)
    const updated = getCustomAgents()
    setCustomAgents(updated)
    setCustomSignals((p) => { const next = { ...p }; delete next[name]; return next })
    if (selectedAgent === name) setSelectedAgent(AGENT_DEFS[0].name)
    setDeleteConfirm(null)
  }

  function handleSaveAgent() {
    if (!newAgent.name.trim()) return
    const c = getStoredConfigs()
    c[`__agent__${newAgent.name}`] = JSON.stringify(newAgent)
    localStorage.setItem('agentConfigs', JSON.stringify(c))
    setCreateSaved(true)
    setTemplateReady(false)
    setCustomAgents(getCustomAgents())
    setTimeout(() => setCreateSaved(false), 4000)
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const agent = agentDef(selectedAgent)
  const agentCards = cards?.filter((c) => c.agentSource === selectedAgent) ?? []
  const filteredCards = getFilteredSorted()

  // ── Shared card renderer ──────────────────────────────────────────────────────
  function renderCard(card: ActionCard) {
    const def = agentDef(card.agentSource)
    return (
      <SignalCard
        key={card.id}
        card={card}
        status={cardStatus[card.id] || 'pending'}
        isApproving={approving[card.id] || false}
        chatOpen={cardChatOpen === card.id}
        chatMessages={cardChats[card.id] || []}
        chatInput={cardChatInput[card.id] || ''}
        chatStreaming={cardChatStreaming[card.id] || false}
        agentColor={def.color}
        agentLight={def.light}
        agentBorder={def.border}
        previewOpen={previewOpen[card.id] || false}
        mutations={getCardMutations(card)}
        onTogglePreview={() => setPreviewOpen((p) => ({ ...p, [card.id]: !p[card.id] }))}
        onMutationValueChange={(idx, newVal) => {
          const base = getCardMutations(card)
          const updated = base.map((m, i) => i === idx ? { ...m, value: newVal } : m)
          setCardMutationOverrides((p) => ({ ...p, [card.id]: updated }))
        }}
        actionId={approvedActionIds[card.id]}
        impactData={impactData[card.id] ?? null}
        impactLoading={impactLoading[card.id] || false}
        impactOpen={impactOpen[card.id] || false}
        onToggleImpact={() => {
          const aId = approvedActionIds[card.id]
          if (!aId) return
          const next = !impactOpen[card.id]
          setImpactOpen((p) => ({ ...p, [card.id]: next }))
          if (next && !impactData[card.id]) fetchImpact(card.id, aId)
        }}
        onApprove={() => handleApprove(card)}
        onDismiss={() => handleDismiss(card)}
        onToggleChat={() => {
          if (cardChatOpen === card.id) { setCardChatOpen(null); return }
          setCardChatOpen(card.id)
          if (!cardChats[card.id]?.length) sendCardChat(card.id, card, 'Why did you flag this?')
        }}
        onChatInputChange={(v) => setCardChatInput((p) => ({ ...p, [card.id]: v }))}
        onChatSend={(text) => sendCardChat(card.id, card, text)}
      />
    )
  }

  // ── Pending count per agent ───────────────────────────────────────────────────
  function pendingCount(agentName: string) {
    return cards?.filter((c) => c.agentSource === agentName && (cardStatus[c.id] || 'pending') === 'pending').length ?? 0
  }

  function isCustomAgent(agentName: string): boolean {
    return !AGENT_DEFS.find((a) => a.name === agentName)
  }

  async function generateCustomAgentSignals(agentName: string) {
    setGeneratingSignals((p) => ({ ...p, [agentName]: true }))
    try {
      const agent = customAgents.find((a) => a.name === agentName)
      if (!agent) return
      // Fetch raw product rows (not ActionCards) for richer context
      const peekRes = await fetch('/api/db-peek')
      const peekData = await peekRes.json()
      const products = peekData.products || []
      if (!products.length) return
      const res = await fetch('/api/generate-agent-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName, agentConfig: agent.focus, products })
      })
      const data = await res.json()
      setCustomSignals((p) => ({ ...p, [agentName]: data.signals || [] }))
    } catch (err) {
      console.error('Error generating signals:', err)
    } finally {
      setGeneratingSignals((p) => ({ ...p, [agentName]: false }))
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ paddingTop: 56, minHeight: '100vh', background: '#F8FAFC', fontFamily: SANS }}>

      {/* ── Page header + top tabs ── */}
      <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ padding: '20px 28px 0' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>Agents</h1>
          <p style={{ fontSize: 14, color: '#64748B', marginBottom: 0 }}>View all signals, manage individual agents, and create new ones.</p>
        </div>
        <div style={{ display: 'flex', padding: '0 28px', gap: 0, marginTop: 12 }}>
          {([
            { key: 'all' as const,    label: cards ? `All Signals (${cards.length})` : 'All Signals' },
            { key: 'agents' as const, label: 'Agents' },
            { key: 'create' as const, label: '+ Create Agent' },
            { key: 'data' as const,   label: 'Data' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPageView(tab.key)}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: `3px solid ${pageView === tab.key ? '#F59E0B' : 'transparent'}`,
                padding: '10px 20px', fontSize: 13, fontWeight: 600,
                color: pageView === tab.key ? '#0F172A' : '#94A3B8',
                cursor: 'pointer', fontFamily: SANS, marginBottom: -1, transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════ ALL SIGNALS VIEW ══════════════ */}
      {pageView === 'all' && (
        <div style={{ padding: '20px 28px' }}>

          {/* Filter + sort bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filter</span>

            <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} style={{ border: '1px solid #E2E8F0', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: SANS, background: 'white', color: '#1E293B', cursor: 'pointer' }}>
              <option value="all">All Agents</option>
              {AGENT_DEFS.map((a) => <option key={a.name} value={a.name}>{a.icon} {a.name}</option>)}
            </select>

            <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value as Severity | 'all')} style={{ border: '1px solid #E2E8F0', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: SANS, background: 'white', color: '#1E293B', cursor: 'pointer' }}>
              <option value="all">All Severities</option>
              <option value="red">Critical</option>
              <option value="amber">Watch</option>
              <option value="green">Signal</option>
            </select>

            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as CardStatus | 'all')} style={{ border: '1px solid #E2E8F0', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: SANS, background: 'white', color: '#1E293B', cursor: 'pointer' }}>
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="dismissed">Dismissed</option>
            </select>

            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sort</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} style={{ border: '1px solid #E2E8F0', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: SANS, background: 'white', color: '#1E293B', cursor: 'pointer' }}>
              <option value="severity">Severity (Critical first)</option>
              <option value="agent">Agent</option>
              <option value="mutations">Most Steps</option>
              <option value="skus">Most SKUs</option>
            </select>

            <div style={{ fontSize: 12, color: '#94A3B8', padding: '6px 12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: 7 }}>
              {filteredCards.length} result{filteredCards.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Agent quick-filter chips */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            <button
              onClick={() => setFilterAgent('all')}
              style={{ background: filterAgent === 'all' ? '#0F172A' : 'white', border: '1px solid #E2E8F0', borderRadius: 20, padding: '4px 14px', fontSize: 12, color: filterAgent === 'all' ? 'white' : '#64748B', fontWeight: 600, cursor: 'pointer', fontFamily: SANS }}
            >
              All
            </button>
            {AGENT_DEFS.map((a) => {
              const pc = pendingCount(a.name)
              const isActive = filterAgent === a.name
              return (
                <button
                  key={a.name}
                  onClick={() => setFilterAgent(isActive ? 'all' : a.name)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: isActive ? a.light : 'white', border: `1px solid ${isActive ? a.border : '#E2E8F0'}`, borderRadius: 20, padding: '4px 12px', fontSize: 12, color: isActive ? a.color : '#64748B', fontWeight: isActive ? 700 : 400, cursor: 'pointer', fontFamily: SANS, transition: 'all 0.15s' }}
                >
                  <span>{a.icon}</span>
                  <span>{a.name.replace(' Agent', '')}</span>
                  {pc > 0 && (
                    <span style={{ background: isActive ? a.color : '#E2E8F0', color: isActive ? 'white' : '#64748B', borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 700 }}>{pc}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Cards */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8', fontSize: 14 }}>Loading signals…</div>
          ) : filteredCards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 14, color: '#CBD5E1', marginBottom: 6 }}>No signals match your filters</div>
              <button onClick={() => { setFilterAgent('all'); setFilterSeverity('all'); setFilterStatus('all') }} style={{ fontSize: 12, color: '#F59E0B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, textDecoration: 'underline' }}>Clear filters</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              {filteredCards.map((card) => renderCard(card))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ AGENTS DETAIL VIEW ══════════════ */}
      {pageView === 'agents' && (
        <div style={{ display: 'flex', height: 'calc(100vh - 56px - 117px)', overflow: 'hidden' }}>

          {/* Sidebar */}
          <aside style={{ width: 264, background: 'white', borderRight: '1px solid #E2E8F0', overflowY: 'auto', flexShrink: 0, padding: '16px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>Select Agent</div>
            {AGENT_DEFS.map((a) => {
              const pc = pendingCount(a.name)
              const isSelected = selectedAgent === a.name
              return (
                <button
                  key={a.name}
                  onClick={() => { setSelectedAgent(a.name); setActiveSection('signals') }}
                  style={{ width: '100%', textAlign: 'left', background: isSelected ? a.light : 'transparent', border: `1px solid ${isSelected ? a.border : '#E2E8F0'}`, borderRadius: 9, padding: '12px', marginBottom: 8, cursor: 'pointer', fontFamily: SANS, transition: 'all 0.15s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 18 }}>{a.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? a.color : '#1E293B', flex: 1 }}>{a.name}</span>
                    {pc > 0 && (
                      <span style={{ background: a.color, color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{pc}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8', lineHeight: 1.4, marginBottom: agentConfigs[a.name] ? 7 : 0 }}>{a.desc.slice(0, 62)}…</div>
                  {agentConfigs[a.name] && (
                    <div style={{ fontSize: 11, color: isSelected ? a.color : '#64748B', fontStyle: 'italic', background: isSelected ? 'white' : '#F8FAFC', border: `1px solid ${isSelected ? a.border : '#E2E8F0'}`, borderRadius: 4, padding: '3px 7px', lineHeight: 1.3 }}>
                      &ldquo;{agentConfigs[a.name].slice(0, 44)}{agentConfigs[a.name].length > 44 ? '…' : ''}&rdquo;
                    </div>
                  )}
                </button>
              )
            })}

            {/* Custom agents */}
            {customAgents.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', margin: '12px 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Custom
                  <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                </div>
                {customAgents.map((a) => {
                  const isSelected = selectedAgent === a.name
                  return (
                    <div
                      key={a.name}
                      style={{ position: 'relative' as const, marginBottom: 8 }}
                    >
                      <button
                        onClick={() => { setSelectedAgent(a.name); setActiveSection('signals'); setDeleteConfirm(null) }}
                        style={{ width: '100%', textAlign: 'left', background: isSelected ? a.light : 'transparent', border: `1px solid ${isSelected ? a.border : '#E2E8F0'}`, borderRadius: 9, padding: '12px', paddingRight: 36, cursor: 'pointer', fontFamily: SANS, transition: 'all 0.15s' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ fontSize: 18 }}>{a.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? a.color : '#1E293B', flex: 1 }}>{a.name}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: a.color, background: 'white', border: `1px solid ${a.border}`, borderRadius: 8, padding: '1px 6px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>Custom</span>
                        </div>
                        {a.category && (
                          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: 4 }}>{a.category}</div>
                        )}
                        <div style={{ fontSize: 11, color: '#94A3B8', lineHeight: 1.4 }}>{a.focus.slice(0, 70)}{a.focus.length > 70 ? '…' : ''}</div>
                      </button>
                      {/* Delete button */}
                      {deleteConfirm === a.name ? (
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                          <button
                            onClick={() => handleDeleteAgent(a.name)}
                            style={{ flex: 1, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '5px', fontSize: 11, fontWeight: 700, color: '#EF4444', cursor: 'pointer', fontFamily: SANS }}
                          >
                            Confirm Delete
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 6, padding: '5px 8px', fontSize: 11, color: '#94A3B8', cursor: 'pointer', fontFamily: SANS }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(a.name) }}
                          title="Delete agent"
                          style={{ position: 'absolute' as const, top: 8, right: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: 14, lineHeight: 1, padding: 4, borderRadius: 4 }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </aside>

          {/* Main content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Agent header + section tabs */}
            <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '0 24px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: agent.light, border: `2px solid ${agent.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{agent.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: agent.color }}>{selectedAgent}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>{agent.desc}</div>
                </div>
                {agentConfigs[selectedAgent] && (
                  <div style={{ fontSize: 11, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '5px 10px', maxWidth: 220 }}>
                    <span style={{ color: '#94A3B8', fontWeight: 600 }}>Active: </span>
                    {agentConfigs[selectedAgent].slice(0, 40)}{agentConfigs[selectedAgent].length > 40 ? '…' : ''}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex' }}>
                {([
                  { key: 'signals' as const,   label: `Signals (${agentCards.length})` },
                  { key: 'configure' as const, label: '⚙ Configure' },
                  { key: 'query' as const,     label: '💬 Query' },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveSection(tab.key)}
                    style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${activeSection === tab.key ? agent.color : 'transparent'}`, padding: '10px 18px', fontSize: 13, fontWeight: 600, color: activeSection === tab.key ? agent.color : '#94A3B8', cursor: 'pointer', marginBottom: -1, fontFamily: SANS, transition: 'color 0.15s' }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Signals tab ── */}
            {activeSection === 'signals' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                {isCustomAgent(selectedAgent) ? (
                  /* Custom agent signals */
                  <>
                    {loading && !customSignals[selectedAgent] ? (
                      <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 14 }}>Loading product data…</div>
                    ) : generatingSignals[selectedAgent] ? (
                      <div style={{ textAlign: 'center', padding: 60 }}>
                        <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 2s linear infinite' }}>⚙️</div>
                        <div style={{ fontSize: 15, color: '#1E293B', fontWeight: 600, marginBottom: 6 }}>Generating signals…</div>
                        <div style={{ fontSize: 13, color: '#94A3B8' }}>Analyzing your data with {selectedAgent}</div>
                      </div>
                    ) : (customSignals[selectedAgent]?.length ?? 0) > 0 ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>Generated {customSignals[selectedAgent].length} signal{customSignals[selectedAgent].length !== 1 ? 's' : ''}</span>
                          <button
                            onClick={() => generateCustomAgentSignals(selectedAgent)}
                            style={{ fontSize: 11, padding: '5px 12px', border: '1px solid #E2E8F0', borderRadius: 6, background: 'white', cursor: 'pointer', color: '#64748B', fontFamily: SANS }}
                          >
                            ↻ Regenerate
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                          {customSignals[selectedAgent].map((card) => renderCard(card))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: 60 }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>✨</div>
                        <div style={{ fontSize: 15, color: '#1E293B', fontWeight: 600, marginBottom: 6 }}>No signals yet</div>
                        <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 20 }}>Click "Generate" to analyse your data and find opportunities</div>
                        <button
                          onClick={() => generateCustomAgentSignals(selectedAgent)}
                          style={{ background: agent.color, border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, color: 'white', cursor: 'pointer', fontFamily: SANS }}
                        >
                          ⚡ Generate Signals
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  /* Built-in agent signals */
                  <>
                    {loading ? (
                      <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 14 }}>Loading…</div>
                    ) : agentCards.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 60 }}>
                        <div style={{ fontSize: 15, color: '#CBD5E1', marginBottom: 6 }}>No signals from this agent</div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                        {agentCards.map((card) => renderCard(card))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Configure tab ── */}
            {activeSection === 'configure' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Configure header */}
                <div style={{ padding: '14px 24px', background: agent.light, borderBottom: `1px solid ${agent.border}`, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: agentConfigs[selectedAgent] ? 10 : 0 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: agent.color, marginBottom: 3 }}>Configure {selectedAgent}</div>
                      <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
                        Chat to craft an instruction, then apply it. Instructions shape how this agent explains and prioritises signals.
                      </div>
                    </div>
                    {agentConfigs[selectedAgent] && (
                      <button
                        onClick={handleRevert}
                        style={{ background: revertConfirm ? '#FEF2F2' : 'white', border: `1px solid ${revertConfirm ? '#FCA5A5' : '#E2E8F0'}`, borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: revertConfirm ? '#EF4444' : '#94A3B8', cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        {revertConfirm ? '⚠ Confirm Revert' : 'Revert to Default'}
                      </button>
                    )}
                  </div>
                  {agentConfigs[selectedAgent] && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Active instruction</span>
                      <div style={{ flex: 1, background: 'white', border: `1px solid ${agent.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 12, color: '#1E293B', fontStyle: 'italic' }}>
                        &ldquo;{agentConfigs[selectedAgent]}&rdquo;
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                  {(configChat[selectedAgent] || []).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>{agent.icon}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', marginBottom: 6 }}>{selectedAgent}</div>
                      <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6, marginBottom: 20 }}>
                        Chat to design this agent&apos;s focus, or type an instruction directly below and click Apply.
                      </div>
                      {[
                        'Only flag SKUs with more than 20 weeks of supply',
                        'Focus on Electronics and Beauty categories only',
                        'Be more aggressive with markdown recommendations',
                        'Prioritise margin recovery over sell-through velocity',
                      ].map((s) => (
                        <button key={s} onClick={() => setConfigInput(s)} style={{ display: 'block', width: '100%', maxWidth: 420, margin: '8px auto 0', background: 'white', border: `1px solid ${agent.border}`, borderRadius: 7, padding: '9px 16px', fontSize: 12, color: '#64748B', cursor: 'pointer', fontFamily: SANS, textAlign: 'left' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : (
                    (configChat[selectedAgent] || []).map((msg, i) => (
                      <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '80%', background: msg.role === 'user' ? agent.light : '#F8FAFC', border: `1px solid ${msg.role === 'user' ? agent.border : '#E2E8F0'}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1E293B', lineHeight: 1.5 }}>
                          {msg.content || (configStreaming && i === (configChat[selectedAgent] || []).length - 1 ? <span style={{ color: agent.color }}>▍</span> : null)}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={configBottomRef} />
                </div>

                {/* Input area with Apply / Cancel draft bar */}
                <div style={{ padding: '12px 24px 14px', borderTop: '1px solid #E2E8F0', background: 'white', flexShrink: 0 }}>
                  {configInput.trim() && !configStreaming && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, background: agent.light, border: `1px solid ${agent.border}`, borderRadius: 7, padding: '8px 12px' }}>
                      <span style={{ fontSize: 11, color: agent.color, fontWeight: 700, whiteSpace: 'nowrap' }}>Draft:</span>
                      <span style={{ flex: 1, fontSize: 12, color: '#64748B', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>&ldquo;{configInput}&rdquo;</span>
                      <button onClick={() => sendConfigChat(configInput)} style={{ background: agent.color, border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 700, color: 'white', cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}>Apply</button>
                      <button onClick={() => setConfigInput('')} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: '#94A3B8', cursor: 'pointer', fontFamily: SANS }}>Cancel</button>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={configInput}
                      onChange={(e) => setConfigInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && configInput.trim() && !configStreaming) { e.preventDefault(); sendConfigChat(configInput) } }}
                      placeholder={`Instruct ${selectedAgent}…`}
                      disabled={configStreaming}
                      style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontFamily: SANS, background: configStreaming ? '#F8FAFC' : 'white' }}
                    />
                    <button onClick={() => sendConfigChat(configInput)} disabled={configStreaming || !configInput.trim()} style={{ background: configStreaming || !configInput.trim() ? '#F1F5F9' : agent.color, border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600, color: configStreaming || !configInput.trim() ? '#94A3B8' : 'white', cursor: configStreaming || !configInput.trim() ? 'not-allowed' : 'pointer', fontFamily: SANS }}>Send</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Query tab ── */}
            {activeSection === 'query' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '12px 24px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', flexShrink: 0, fontSize: 13, color: '#64748B' }}>
                  Ask {selectedAgent} questions about your data. It has full access to your live product catalog.
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                  {(queryChat[selectedAgent] || []).length === 0 && (
                    <div style={{ textAlign: 'center', padding: '30px 0' }}>
                      <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 14 }}>Suggested questions:</div>
                      {[
                        'Which products should I act on first?',
                        "What is the total revenue impact of your recommendations?",
                        'Are there any categories I am over-indexed on?',
                        'Which of your signals has the highest margin recovery potential?',
                      ].map((q) => (
                        <button key={q} onClick={() => sendQueryChat(q)} style={{ display: 'block', width: '100%', maxWidth: 420, margin: '0 auto 8px', background: 'white', border: `1px solid ${agent.border}`, borderRadius: 7, padding: '9px 16px', fontSize: 12, color: '#64748B', cursor: 'pointer', fontFamily: SANS, textAlign: 'left' }}>{q}</button>
                      ))}
                    </div>
                  )}
                  {(queryChat[selectedAgent] || []).map((msg, i) => (
                    <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '80%', background: msg.role === 'user' ? '#1E293B' : '#F8FAFC', border: msg.role === 'assistant' ? '1px solid #E2E8F0' : 'none', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: msg.role === 'user' ? 'white' : '#1E293B', lineHeight: 1.5 }}>
                        {msg.content || (queryStreaming && i === (queryChat[selectedAgent] || []).length - 1 ? <span style={{ color: '#F59E0B' }}>▍</span> : null)}
                      </div>
                    </div>
                  ))}
                  <div ref={queryBottomRef} />
                </div>
                <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 8 }}>
                  <input value={queryInput} onChange={(e) => setQueryInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && queryInput.trim() && !queryStreaming) { e.preventDefault(); sendQueryChat(queryInput) } }} placeholder={`Ask ${selectedAgent}…`} disabled={queryStreaming} style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontFamily: SANS }} />
                  <button onClick={() => sendQueryChat(queryInput)} disabled={queryStreaming || !queryInput.trim()} style={{ background: queryStreaming || !queryInput.trim() ? '#F1F5F9' : '#1E293B', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600, color: queryStreaming || !queryInput.trim() ? '#94A3B8' : 'white', cursor: queryStreaming || !queryInput.trim() ? 'not-allowed' : 'pointer', fontFamily: SANS }}>Ask →</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ CREATE AGENT VIEW ══════════════ */}
      {pageView === 'create' && (
        <div style={{ display: 'flex', height: 'calc(100vh - 56px - 117px)', overflow: 'hidden' }}>

          {/* Left: AI chat */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', background: 'white', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>Design with AI</div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>Describe what you want your agent to monitor. The AI will help you define scope, triggers, and thresholds.</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {createChat.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1E293B', marginBottom: 8 }}>What should this agent watch?</div>
                  <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 28, lineHeight: 1.6, maxWidth: 400, margin: '0 auto 28px' }}>
                    Describe the problem space and the AI will help you refine the agent scope, alert conditions, and recommended actions.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxWidth: 540, margin: '0 auto' }}>
                    {[
                      'I want an agent that alerts me when any SKU is about to stock out',
                      'Create an agent that finds bundle and cross-sell opportunities',
                      'I need something that monitors margin compression across categories',
                      'Build an agent focused on my seasonal inventory rotation',
                    ].map((s) => (
                      <button key={s} onClick={() => sendCreateChat(s)} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#64748B', cursor: 'pointer', fontFamily: SANS, textAlign: 'left', lineHeight: 1.4 }}>{s}</button>
                    ))}
                  </div>
                </div>
              ) : (
                createChat.map((msg, i) => (
                  <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '85%', background: msg.role === 'user' ? '#1E293B' : 'white', border: msg.role === 'assistant' ? '1px solid #E2E8F0' : 'none', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: msg.role === 'user' ? 'white' : '#1E293B', lineHeight: 1.5 }}>
                      {msg.content || (createStreaming && i === createChat.length - 1 ? <span style={{ color: '#F59E0B' }}>▍</span> : null)}
                    </div>
                  </div>
                ))
              )}
              <div ref={createBottomRef} />
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 8 }}>
              <input value={createInput} onChange={(e) => setCreateInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && createInput.trim() && !createStreaming) { e.preventDefault(); sendCreateChat(createInput) } }} placeholder="Describe your agent…" disabled={createStreaming} style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontFamily: SANS }} />
              <button onClick={() => sendCreateChat(createInput)} disabled={createStreaming || !createInput.trim()} style={{ background: createStreaming || !createInput.trim() ? '#F1F5F9' : '#1E293B', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600, color: createStreaming || !createInput.trim() ? '#94A3B8' : 'white', cursor: createStreaming || !createInput.trim() ? 'not-allowed' : 'pointer', fontFamily: SANS }}>Send</button>
            </div>
          </div>

          {/* Right: Config form + suggestions */}
          <div style={{ width: 348, background: 'white', overflowY: 'auto', flexShrink: 0 }}>

            {/* Form */}
            <div style={{ padding: '20px 20px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Agent Configuration</div>
                {templateReady && (
                  <div style={{ fontSize: 11, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10, padding: '2px 9px', color: '#22C55E', fontWeight: 700 }}>
                    ✓ Auto-filled from chat
                  </div>
                )}
              </div>

              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Name</label>
              <input value={newAgent.name} onChange={(e) => setNewAgent((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Stockout Prevention" style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: SANS, marginBottom: 14, boxSizing: 'border-box' as const }} />

              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Category</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' as const }}>
                {['Markdown', 'Pricing', 'Assortment', 'Risk', 'Custom…'].map((cat) => {
                  const isCustomOpt = cat === 'Custom…'
                  const isActive = isCustomOpt ? customCategoryInput : newAgent.category === cat && !customCategoryInput
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        if (isCustomOpt) {
                          setCustomCategoryInput(true)
                          setNewAgent((p) => ({ ...p, category: p.customCategory || '' }))
                        } else {
                          setCustomCategoryInput(false)
                          setNewAgent((p) => ({ ...p, category: cat, customCategory: '' }))
                        }
                      }}
                      style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 20, border: `1px solid ${isActive ? '#F59E0B' : '#E2E8F0'}`, background: isActive ? '#FFFBEB' : 'white', color: isActive ? '#F59E0B' : '#64748B', cursor: 'pointer', fontFamily: SANS }}
                    >
                      {cat}
                    </button>
                  )
                })}
              </div>
              {customCategoryInput && (
                <input
                  value={newAgent.customCategory}
                  onChange={(e) => setNewAgent((p) => ({ ...p, customCategory: e.target.value, category: e.target.value }))}
                  placeholder="Category name…"
                  style={{ width: '100%', border: '1px solid #F59E0B', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: SANS, marginBottom: 14, boxSizing: 'border-box' as const, background: '#FFFBEB' }}
                />
              )}

              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Focus &amp; Trigger</label>
              <textarea value={newAgent.focus} onChange={(e) => setNewAgent((p) => ({ ...p, focus: e.target.value }))} placeholder="What should this agent monitor, and when should it alert?" rows={3} style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: SANS, resize: 'vertical' as const, marginBottom: 14, boxSizing: 'border-box' as const }} />

              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Icon</label>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 14 }}>
                {ICON_OPTS.map((icon) => (
                  <button key={icon} onClick={() => setNewAgent((p) => ({ ...p, icon }))} style={{ width: 36, height: 36, borderRadius: 8, border: `2px solid ${newAgent.icon === icon ? '#F59E0B' : '#E2E8F0'}`, background: newAgent.icon === icon ? '#FFFBEB' : 'white', fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</button>
                ))}
              </div>

              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Color</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' as const }}>
                {COLOR_OPTS.map((c) => (
                  <button key={c.color} onClick={() => setNewAgent((p) => ({ ...p, color: c.color, light: c.light, border: c.border }))} title={c.name} style={{ width: 28, height: 28, borderRadius: '50%', background: c.color, border: `3px solid ${newAgent.color === c.color ? '#0F172A' : 'transparent'}`, cursor: 'pointer', outline: newAgent.color === c.color ? `2px solid ${c.color}` : 'none', outlineOffset: 2 }} />
                ))}
              </div>

              {/* Preview */}
              <div style={{ background: newAgent.light || '#F8FAFC', border: `1px solid ${newAgent.border || '#E2E8F0'}`, borderRadius: 9, padding: '12px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 20 }}>{newAgent.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: newAgent.color || '#94A3B8', flex: 1 }}>{newAgent.name || 'Agent Name'}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: newAgent.color || '#94A3B8', background: 'white', border: `1px solid ${newAgent.border || '#E2E8F0'}`, borderRadius: 8, padding: '1px 6px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>Custom</span>
                </div>
                {newAgent.category && <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: 4 }}>{newAgent.category}</div>}
                <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4 }}>{newAgent.focus || 'Agent focus will appear here'}</div>
              </div>

              <button
                onClick={handleSaveAgent}
                disabled={!newAgent.name.trim()}
                style={{ width: '100%', background: createSaved ? '#F0FDF4' : !newAgent.name.trim() ? '#F1F5F9' : templateReady ? '#22C55E' : '#0F172A', border: `1px solid ${createSaved ? '#86EFAC' : 'transparent'}`, borderRadius: 8, padding: '11px', fontSize: 13, fontWeight: 700, color: createSaved ? '#22C55E' : !newAgent.name.trim() ? '#94A3B8' : 'white', cursor: !newAgent.name.trim() ? 'not-allowed' : 'pointer', fontFamily: SANS, transition: 'all 0.2s' }}
              >
                {createSaved ? '✓ Agent Deployed' : templateReady ? '⚡ Deploy Agent' : 'Save Agent'}
              </button>
            </div>

            {/* Suggested agents */}
            <div style={{ padding: '4px 20px 24px' }}>
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 18, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>Suggested Agents</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>Based on patterns in your current data</div>
              </div>
              {AGENT_SUGGESTIONS.map((s) => (
                <div key={s.name} style={{ background: s.light, border: `1px solid ${s.border}`, borderRadius: 9, padding: '12px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                    <span style={{ fontSize: 16 }}>{s.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4, marginBottom: 6 }}>{s.focus}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic', marginBottom: 10 }}>Signal: {s.reason}</div>
                  <button
                    onClick={() => setNewAgent({ name: s.name, focus: s.focus, icon: s.icon, color: s.color, light: s.light, border: s.border, category: 'Markdown', customCategory: '' })}
                    style={{ background: 'white', border: `1px solid ${s.border}`, borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: s.color, cursor: 'pointer', fontFamily: SANS }}
                  >
                    Use this template
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ DATA VIEW ══════════════ */}
      {pageView === 'data' && (
        <div style={{ padding: '20px 28px' }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Database Preview</h2>
            <p style={{ fontSize: 13, color: '#64748B' }}>Browse the complete live_products table. Filter by category or browse all products.</p>
          </div>

          {/* Category filter + pagination info */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={dataCategory || ''}
              onChange={(e) => { setDataCategory(e.target.value || null); setDataPage(1) }}
              style={{ border: '1px solid #E2E8F0', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontFamily: SANS, background: 'white', color: '#1E293B', cursor: 'pointer' }}
            >
              <option value="">All Categories ({dataTotal} SKUs)</option>
              {dataCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>

            {dataPages > 1 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  disabled={dataPage === 1}
                  onClick={() => fetchDataProducts(dataCategory, dataPage - 1)}
                  style={{ background: dataPage === 1 ? '#F1F5F9' : 'white', border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: dataPage === 1 ? 'not-allowed' : 'pointer', color: '#1E293B', fontFamily: SANS }}
                >
                  ← Prev
                </button>
                <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>Page {dataPage} of {dataPages}</span>
                <button
                  disabled={dataPage === dataPages}
                  onClick={() => fetchDataProducts(dataCategory, dataPage + 1)}
                  style={{ background: dataPage === dataPages ? '#F1F5F9' : 'white', border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: dataPage === dataPages ? 'not-allowed' : 'pointer', color: '#1E293B', fontFamily: SANS }}
                >
                  Next →
                </button>
              </div>
            )}

            <button
              onClick={() => { setDataCategory(null); setDataPage(1); fetchDataProducts(null, 1) }}
              style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#1E40AF', cursor: 'pointer', fontFamily: SANS }}
            >
              Reload
            </button>
          </div>

          {/* Product table */}
          {dataLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>Loading products...</div>
          ) : dataProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>No products found</div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', fontFamily: SANS }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#0F172A' }}>SKU</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#0F172A' }}>Name</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#0F172A' }}>Category</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>Price</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>Stock</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>Sell-Thru %</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>Weeks Supply</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>Inv Value</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#0F172A' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dataProducts.map((p, idx) => (
                    <tr key={p.sku_id} style={{ borderBottom: idx < dataProducts.length - 1 ? '1px solid #F1F5F9' : 'none', background: idx % 2 === 0 ? 'white' : '#F8FAFC' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1E293B' }}>{p.sku_id}</td>
                      <td style={{ padding: '10px 12px', color: '#1E293B' }}>{p.name}</td>
                      <td style={{ padding: '10px 12px', color: '#64748B' }}>{p.category}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#1E293B' }}>${p.retail_price.toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#1E293B' }}>{p.current_stock}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#1E293B' }}>{p.sell_through_rate.toFixed(0)}%</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#1E293B' }}>{p.weeks_of_supply.toFixed(1)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#1E293B' }}>${p.inventory_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: p.status === 'active' ? '#F0FDF4' : p.status === 'on_markdown' ? '#FEF3C7' : '#F0F9FF', color: p.status === 'active' ? '#15803D' : p.status === 'on_markdown' ? '#B45309' : '#0369A1' }}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination controls at bottom */}
          {dataPages > 1 && (
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                disabled={dataPage === 1}
                onClick={() => fetchDataProducts(dataCategory, dataPage - 1)}
                style={{ background: dataPage === 1 ? '#F1F5F9' : 'white', border: '1px solid #E2E8F0', borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: dataPage === 1 ? 'not-allowed' : 'pointer', color: '#1E293B', fontFamily: SANS }}
              >
                ← Previous
              </button>
              {Array.from({ length: dataPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => fetchDataProducts(dataCategory, p)}
                  style={{ background: p === dataPage ? '#F59E0B' : 'white', border: `1px solid ${p === dataPage ? '#F59E0B' : '#E2E8F0'}`, borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: p === dataPage ? 'white' : '#1E293B', cursor: 'pointer', fontFamily: SANS }}
                >
                  {p}
                </button>
              ))}
              <button
                disabled={dataPage === dataPages}
                onClick={() => fetchDataProducts(dataCategory, dataPage + 1)}
                style={{ background: dataPage === dataPages ? '#F1F5F9' : 'white', border: '1px solid #E2E8F0', borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: dataPage === dataPages ? 'not-allowed' : 'pointer', color: '#1E293B', fontFamily: SANS }}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
