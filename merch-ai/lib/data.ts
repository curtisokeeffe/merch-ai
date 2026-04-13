import fs from 'fs'
import Papa from 'papaparse'

const CSV_PATH =
  process.env.CSV_PATH ||
  'C:\\Users\\cokeeffe1\\Desktop\\retail_sales_dataset.csv'

interface RawRow {
  'Transaction ID': string
  Date: string
  'Customer ID': string
  Gender: string
  Age: string
  'Product Category': string
  Quantity: string
  'Price per Unit': string
  'Total Amount': string
}

export interface ParsedRow {
  transactionId: number
  date: Date
  customerId: string
  gender: string
  age: number
  category: string
  quantity: number
  pricePerUnit: number
  totalAmount: number
  month: number
  quarter: number
}

export interface KPI {
  label: string
  value: string
  sub?: string
}

export type Severity = 'red' | 'amber' | 'green'

export interface ActionCard {
  id: string
  severity: Severity
  title: string
  impact: string
  context: string
  dataSummary: string
}

export interface Insights {
  kpis: KPI[]
  cards: ActionCard[]
  datasetSummary: string
}

export function loadData(): ParsedRow[] {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8')
  const { data } = Papa.parse<RawRow>(raw, { header: true, skipEmptyLines: true })
  return data.map((r) => {
    const date = new Date(r['Date'])
    const month = date.getMonth() + 1
    return {
      transactionId: parseInt(r['Transaction ID']),
      date,
      customerId: r['Customer ID'],
      gender: r['Gender'],
      age: parseInt(r['Age']),
      category: r['Product Category'],
      quantity: parseInt(r['Quantity']),
      pricePerUnit: parseFloat(r['Price per Unit']),
      totalAmount: parseFloat(r['Total Amount']),
      month,
      quarter: Math.ceil(month / 3),
    }
  }).filter((r) => !isNaN(r.totalAmount))
}

function sum(rows: ParsedRow[], field: 'totalAmount' | 'quantity' | 'pricePerUnit'): number {
  return rows.reduce((s, r) => s + r[field], 0)
}

function usd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function computeInsights(rows: ParsedRow[]): Insights {
  const totalRevenue = sum(rows, 'totalAmount')
  const totalTx = rows.length
  const aov = totalRevenue / totalTx

  // --- KPIs ---
  const cats = [...new Set(rows.map((r) => r.category))]
  const catRev: Record<string, number> = {}
  for (const cat of cats) {
    catRev[cat] = sum(rows.filter((r) => r.category === cat), 'totalAmount')
  }
  const topCat = Object.entries(catRev).sort((a, b) => b[1] - a[1])[0]

  const monthRev: Record<number, number> = {}
  for (let m = 1; m <= 12; m++) {
    const v = sum(rows.filter((r) => r.month === m), 'totalAmount')
    if (v > 0) monthRev[m] = v
  }
  const topMonthEntry = Object.entries(monthRev).sort((a, b) => b[1] - a[1])[0]

  const kpis: KPI[] = [
    { label: 'Total Revenue', value: usd(totalRevenue) },
    { label: 'Transactions', value: totalTx.toLocaleString() },
    { label: 'Avg Order Value', value: usd(aov) },
    { label: 'Top Category', value: topCat[0], sub: usd(topCat[1]) },
    { label: 'Peak Month', value: MONTH_NAMES[parseInt(topMonthEntry[0])], sub: usd(topMonthEntry[1]) },
  ]

  // --- Cards ---

  // Card 1: H1 vs H2 category decline
  const h1 = rows.filter((r) => r.month <= 6)
  const h2 = rows.filter((r) => r.month > 6)
  const catTrends = cats.map((cat) => {
    const h1Rev = sum(h1.filter((r) => r.category === cat), 'totalAmount')
    const h2Rev = sum(h2.filter((r) => r.category === cat), 'totalAmount')
    const pct = h1Rev > 0 ? ((h2Rev - h1Rev) / h1Rev) * 100 : 0
    return { cat, h1Rev, h2Rev, pct }
  }).sort((a, b) => a.pct - b.pct)
  const worst = catTrends[0]

  // Card 2: Electronics price tier variance
  const elecRows = rows.filter((r) => r.category === 'Electronics')
  const elecHighRows = elecRows.filter((r) => r.pricePerUnit >= 300)
  const elecLowRows = elecRows.filter((r) => r.pricePerUnit < 100)
  const elecHighAOV = elecHighRows.length ? sum(elecHighRows, 'totalAmount') / elecHighRows.length : 0
  const elecLowAOV = elecLowRows.length ? sum(elecLowRows, 'totalAmount') / elecLowRows.length : 0
  const elecSpreadX = elecLowAOV > 0 ? Math.round(elecHighAOV / elecLowAOV) : 0

  // Card 3: Gender AOV gap
  const maleRows = rows.filter((r) => r.gender === 'Male')
  const femaleRows = rows.filter((r) => r.gender === 'Female')
  const maleAOV = sum(maleRows, 'totalAmount') / maleRows.length
  const femaleAOV = sum(femaleRows, 'totalAmount') / femaleRows.length
  const lowerGender = maleAOV < femaleAOV ? 'Male' : 'Female'
  const higherGender = lowerGender === 'Male' ? 'Female' : 'Male'
  const lowerAOV = Math.min(maleAOV, femaleAOV)
  const higherAOV = Math.max(maleAOV, femaleAOV)
  const genderGapPct = ((higherAOV - lowerAOV) / higherAOV) * 100

  // Card 4: Age segment — best AOV
  const ageBuckets = [
    { label: '18–30', min: 18, max: 30 },
    { label: '31–45', min: 31, max: 45 },
    { label: '46–60', min: 46, max: 60 },
    { label: '61+', min: 61, max: 999 },
  ]
  const bucketStats = ageBuckets.map((b) => {
    const bRows = rows.filter((r) => r.age >= b.min && r.age <= b.max)
    const bRev = sum(bRows, 'totalAmount')
    return {
      label: b.label,
      count: bRows.length,
      aov: bRows.length ? bRev / bRows.length : 0,
      revShare: (bRev / totalRevenue) * 100,
    }
  }).filter((b) => b.count > 0)
  const topBucket = [...bucketStats].sort((a, b) => b.aov - a.aov)[0]
  const bottomBucket = [...bucketStats].sort((a, b) => a.aov - b.aov)[0]

  // Card 5: Beauty multi-buy signal
  const beautyRows = rows.filter((r) => r.category === 'Beauty')
  const clothingRows = rows.filter((r) => r.category === 'Clothing')
  const beautyAvgQty = beautyRows.length ? sum(beautyRows, 'quantity') / beautyRows.length : 0
  const clothingAvgQty = clothingRows.length ? sum(clothingRows, 'quantity') / clothingRows.length : 0
  const elecAvgQty = elecRows.length ? sum(elecRows, 'quantity') / elecRows.length : 0
  const platformAvgQty = sum(rows, 'quantity') / rows.length

  // Card 6: Seasonal concentration
  const sortedMonths = Object.entries(monthRev).sort((a, b) => b[1] - a[1])
  const top3Rev = sortedMonths.slice(0, 3).reduce((s, [, v]) => s + v, 0)
  const top3Share = (top3Rev / totalRevenue) * 100
  const top3Labels = sortedMonths.slice(0, 3).map(([m]) => MONTH_NAMES[parseInt(m)]).join(', ')

  // Card 7: Worst gender × category combo
  const combos = (['Male', 'Female'] as const).flatMap((g) =>
    cats.map((cat) => {
      const comboRows = rows.filter((r) => r.gender === g && r.category === cat)
      if (!comboRows.length) return null
      return {
        gender: g,
        category: cat,
        count: comboRows.length,
        aov: sum(comboRows, 'totalAmount') / comboRows.length,
      }
    })
  ).filter(Boolean) as { gender: string; category: string; count: number; aov: number }[]

  const worstCombo = [...combos].sort((a, b) => a.aov - b.aov)[0]
  const worstComboBelowPlatformPct = ((aov - worstCombo.aov) / aov) * 100

  // Card 8: High-value transaction cluster
  const hvThreshold = aov * 2
  const hvRows = rows.filter((r) => r.totalAmount >= hvThreshold)
  const hvRev = sum(hvRows, 'totalAmount')
  const hvRevShare = (hvRev / totalRevenue) * 100
  const hvTxPct = (hvRows.length / totalTx) * 100

  // Build dataset summary for the ask feature
  const datasetSummary = [
    `Dataset: ${totalTx} transactions across ${cats.length} product categories (${cats.join(', ')}), Jan–Dec 2023.`,
    `Total revenue: ${usd(totalRevenue)}. Platform AOV: ${usd(aov)}.`,
    `Category revenue: ${Object.entries(catRev).map(([c, v]) => `${c}: ${usd(v)}`).join(', ')}.`,
    `Gender split: ${maleRows.length} male (AOV ${usd(maleAOV)}), ${femaleRows.length} female (AOV ${usd(femaleAOV)}).`,
    `Age buckets: ${bucketStats.map((b) => `${b.label}: ${b.count} tx, AOV ${usd(b.aov)}`).join('; ')}.`,
    `Top month: ${MONTH_NAMES[parseInt(topMonthEntry[0])]} (${usd(topMonthEntry[1])}).`,
    `High-value transactions (≥${usd(hvThreshold)}): ${hvRows.length} (${hvRevShare.toFixed(1)}% of revenue).`,
  ].join(' ')

  const cards: ActionCard[] = [
    {
      id: 'cat-decline',
      severity: worst.pct < -5 ? 'red' : 'amber',
      title: `${worst.cat} H2 Revenue ${worst.pct < 0 ? 'Down' : 'Slowing'} ${Math.abs(worst.pct).toFixed(1)}% vs H1`,
      impact: `H1 ${usd(worst.h1Rev)} → H2 ${usd(worst.h2Rev)} — ${usd(Math.abs(worst.h2Rev - worst.h1Rev))} ${worst.pct < 0 ? 'shortfall' : 'deceleration'}`,
      context: `${worst.cat} category showed a ${Math.abs(worst.pct).toFixed(1)}% revenue ${worst.pct < 0 ? 'decline' : 'slowdown'} from H1 (${usd(worst.h1Rev)}) to H2 (${usd(worst.h2Rev)}) of 2023.`,
      dataSummary: `Category: ${worst.cat}. H1 revenue: ${usd(worst.h1Rev)}, H2 revenue: ${usd(worst.h2Rev)}, change: ${worst.pct.toFixed(1)}%. All category trends: ${catTrends.map((c) => `${c.cat}: ${c.pct.toFixed(1)}%`).join(', ')}. Total transactions in ${worst.cat}: ${rows.filter((r) => r.category === worst.cat).length}.`,
    },
    {
      id: 'elec-price-tiers',
      severity: 'amber',
      title: `Electronics ${elecSpreadX}× Price Spread Suppresses Category AOV`,
      impact: `Premium tier avg ${usd(elecHighAOV)} vs budget tier ${usd(elecLowAOV)} — untapped segmentation`,
      context: `Electronics contains extreme price dispersion: ${elecLowRows.length} budget transactions (under $100/unit, avg basket ${usd(elecLowAOV)}) versus ${elecHighRows.length} premium transactions (≥$300/unit, avg basket ${usd(elecHighAOV)}), a ${elecSpreadX}× spread dragging down the category's perceived value.`,
      dataSummary: `Electronics total: ${elecRows.length} transactions. High-ticket (≥$300/unit): ${elecHighRows.length} tx, avg basket ${usd(elecHighAOV)}. Low-ticket (<$100/unit): ${elecLowRows.length} tx, avg basket ${usd(elecLowAOV)}. Platform AOV: ${usd(aov)}.`,
    },
    {
      id: 'gender-gap',
      severity: 'amber',
      title: `${lowerGender} Customers Spend ${genderGapPct.toFixed(1)}% Less Per Visit`,
      impact: `${lowerGender} avg ${usd(lowerAOV)} vs ${higherGender} avg ${usd(higherAOV)} — ${usd(higherAOV - lowerAOV)} gap per transaction`,
      context: `${lowerGender} customers consistently transact at a ${genderGapPct.toFixed(1)}% lower basket value (${usd(lowerAOV)}) compared to ${higherGender} customers (${usd(higherAOV)}). Across ${lowerGender === 'Male' ? maleRows.length : femaleRows.length} transactions, this represents a meaningful revenue lift opportunity.`,
      dataSummary: `Male: ${maleRows.length} transactions, AOV ${usd(maleAOV)}. Female: ${femaleRows.length} transactions, AOV ${usd(femaleAOV)}. Gap: ${usd(Math.abs(maleAOV - femaleAOV))} (${genderGapPct.toFixed(1)}%). Platform AOV: ${usd(aov)}.`,
    },
    {
      id: 'top-age-segment',
      severity: 'green',
      title: `${topBucket.label} Segment: Highest AOV at ${usd(topBucket.aov)}`,
      impact: `${topBucket.revShare.toFixed(1)}% of revenue from ${topBucket.count} customers — ${((topBucket.count / totalTx) * 100).toFixed(1)}% of transactions`,
      context: `The ${topBucket.label} age cohort generates the highest average order value at ${usd(topBucket.aov)}, representing ${topBucket.revShare.toFixed(1)}% of total revenue. This segment is over-indexing on value per visit and should be prioritized for loyalty and personalization programs.`,
      dataSummary: `Age segments: ${bucketStats.map((b) => `${b.label}: ${b.count} tx, AOV ${usd(b.aov)}, ${b.revShare.toFixed(1)}% rev`).join(' | ')}. Platform AOV: ${usd(aov)}.`,
    },
    {
      id: 'beauty-bundling',
      severity: 'green',
      title: 'Beauty Multi-Buy Behaviour Signals Bundle Opportunity',
      impact: `Beauty avg ${beautyAvgQty.toFixed(1)} units/tx vs Electronics ${elecAvgQty.toFixed(1)} — lead with curated sets`,
      context: `Beauty customers already purchase ${beautyAvgQty.toFixed(1)} units per transaction on average — ${((beautyAvgQty / platformAvgQty - 1) * 100).toFixed(0)}% above the platform mean. This organic bundling behaviour is untapped: formalised gift sets or "complete the routine" cross-sells could meaningfully increase basket size without discounting.`,
      dataSummary: `Beauty: ${beautyRows.length} tx, avg qty ${beautyAvgQty.toFixed(2)}, AOV ${usd(sum(beautyRows, 'totalAmount') / beautyRows.length)}. Clothing: avg qty ${clothingAvgQty.toFixed(2)}. Electronics: avg qty ${elecAvgQty.toFixed(2)}. Platform avg qty: ${platformAvgQty.toFixed(2)}.`,
    },
    {
      id: 'seasonal-concentration',
      severity: worst.pct < 0 ? 'amber' : 'green',
      title: `Top 3 Months Capture ${top3Share.toFixed(1)}% of Annual Revenue`,
      impact: `${top3Labels} — ${usd(top3Rev)} of ${usd(totalRevenue)} total, rest of year under-indexed`,
      context: `Revenue is materially seasonal: ${top3Labels} alone account for ${top3Share.toFixed(1)}% of annual sales. This concentration exposes the business to off-peak risk and suggests promotional calendars are not smoothing demand across the year.`,
      dataSummary: `Monthly revenue (sorted): ${sortedMonths.slice(0, 6).map(([m, v]) => `${MONTH_NAMES[parseInt(m)]}: ${usd(v)}`).join(', ')}. Top-3 combined: ${usd(top3Rev)} (${top3Share.toFixed(1)}% of ${usd(totalRevenue)}).`,
    },
    {
      id: 'worst-segment',
      severity: 'red',
      title: `${worstCombo.gender} × ${worstCombo.category}: Lowest Value Segment`,
      impact: `Avg ${usd(worstCombo.aov)} — ${worstComboBelowPlatformPct.toFixed(1)}% below platform average of ${usd(aov)}`,
      context: `${worstCombo.gender} customers shopping ${worstCombo.category} generate just ${usd(worstCombo.aov)} per transaction — ${worstComboBelowPlatformPct.toFixed(1)}% below the platform average of ${usd(aov)}. At ${worstCombo.count} transactions this is a statistically significant pattern requiring targeted intervention.`,
      dataSummary: `Worst segment: ${worstCombo.gender} × ${worstCombo.category}, ${worstCombo.count} tx, AOV ${usd(worstCombo.aov)}. All combos: ${combos.map((c) => `${c.gender}×${c.category}: ${usd(c.aov)}`).join(', ')}. Platform AOV: ${usd(aov)}.`,
    },
    {
      id: 'high-value-cluster',
      severity: 'green',
      title: `${hvRows.length} High-Value Transactions Drive ${hvRevShare.toFixed(1)}% of Revenue`,
      impact: `${hvTxPct.toFixed(1)}% of orders above ${usd(hvThreshold)} — prime loyalty programme candidates`,
      context: `${hvRows.length} transactions above ${usd(hvThreshold)} (2× platform AOV) represent ${hvRevShare.toFixed(1)}% of total revenue from just ${hvTxPct.toFixed(1)}% of orders. These customers are demonstrably high-intent and should be enrolled in a tiered loyalty programme before a competitor captures them.`,
      dataSummary: `High-value threshold: ${usd(hvThreshold)} (2× AOV of ${usd(aov)}). Count: ${hvRows.length} tx (${hvTxPct.toFixed(1)}% of orders). Revenue: ${usd(hvRev)} (${hvRevShare.toFixed(1)}% of total). Total transactions: ${totalTx}.`,
    },
  ]

  return { kpis, cards, datasetSummary }
}
