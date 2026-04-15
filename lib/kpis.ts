import type { Database } from 'better-sqlite3'
import type { ProductRow } from './db'

export interface KPIData {
  inventoryValue: number
  avgMarginPct: number
  markdownCount: number
  avgSellThrough: number
  totalSkus: number
  historicalRevenue: number
}

function usd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function computeKPIs(db: Database): KPIData {
  const rows = db.prepare('SELECT * FROM live_products').all() as ProductRow[]
  if (!rows.length) return { inventoryValue: 0, avgMarginPct: 0, markdownCount: 0, avgSellThrough: 0, totalSkus: 0, historicalRevenue: 0 }

  const inventoryValue = rows.reduce((s, r) => s + r.inventory_value, 0)
  const avgMarginPct = rows.reduce((s, r) => s + ((r.retail_price - r.cost_price) / r.retail_price) * 100, 0) / rows.length
  const markdownCount = rows.filter((r) => r.status === 'on_markdown').length
  const avgSellThrough = rows.reduce((s, r) => s + r.sell_through_rate, 0) / rows.length
  const historicalRevenue = rows.reduce((s, r) => s + r.total_revenue, 0)

  return { inventoryValue, avgMarginPct, markdownCount, avgSellThrough, totalSkus: rows.length, historicalRevenue }
}

export function formatKPIs(data: KPIData) {
  return [
    { key: 'inventoryValue', label: 'Inventory Value', value: usd(data.inventoryValue), raw: data.inventoryValue },
    { key: 'avgMarginPct', label: 'Avg Gross Margin', value: `${data.avgMarginPct.toFixed(1)}%`, raw: data.avgMarginPct },
    { key: 'markdownCount', label: 'SKUs on Markdown', value: String(data.markdownCount), raw: data.markdownCount },
    { key: 'avgSellThrough', label: 'Avg Sell-Through', value: `${data.avgSellThrough.toFixed(1)}%`, raw: data.avgSellThrough },
    { key: 'historicalRevenue', label: 'Historical Revenue', value: usd(data.historicalRevenue), raw: data.historicalRevenue },
  ]
}
