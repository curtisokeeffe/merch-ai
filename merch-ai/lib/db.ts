import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'

const DB_PATH = path.join(process.cwd(), 'data', 'demo.db')
const CSV_PATH = process.env.CSV_PATH || 'C:\\Users\\cokeeffe1\\Desktop\\retail_sales_dataset.csv'

export interface ProductRow {
  sku_id: string
  name: string
  category: string
  price_per_unit: number
  retail_price: number
  cost_price: number
  markdown_pct: number
  status: string
  units_sold: number
  total_revenue: number
  avg_qty_per_tx: number
  transaction_count: number
  current_stock: number
  weeks_of_supply: number
  sell_through_rate: number
  inventory_value: number
}

export interface ConnectionRow {
  id: string
  platform: string
  display_name: string
  auth_type: string
  credentials: string
  status: string
  connected_account: string | null
  read_permissions: string
  write_permissions: string
  guardrails: string
  created_at: string
  last_synced_at: string | null
}

export interface ActionLogRow {
  action_id: string
  agent_source: string
  action_type: string
  title: string
  affected_skus: string
  mutations: string
  changes_made: string
  approved_at: string | null
  status: string
}

const SKU_NAMES: Record<string, Record<string, string>> = {
  Beauty: {
    '25': 'Travel Beauty Essentials Kit',
    '30': 'Daily Skincare Routine Set',
    '50': 'Premium Beauty Collection',
    '100': 'Luxury Spa Treatment Set',
    '500': 'Designer Fragrance Collection',
  },
  Clothing: {
    '25': 'Essential Basic Tee',
    '30': 'Casual Lifestyle Shirt',
    '50': 'Fashion Forward Top',
    '100': 'Premium Knit Sweater',
    '500': 'Designer Premium Outerwear',
  },
  Electronics: {
    '25': 'Device Accessories Bundle',
    '30': 'Basic Tech Gadget',
    '50': 'Smart Home Accessory',
    '100': 'Wireless Audio Device',
    '300': 'Smart Device Pro',
    '500': 'Premium Electronics Suite',
  },
}

// Deterministic inventory scenarios so the demo is consistent
const SCENARIOS = [
  { multiplier: 0.35, sellThrough: 82 },  // fast mover
  { multiplier: 3.20, sellThrough: 24 },  // slow mover — markdown candidate
  { multiplier: 1.10, sellThrough: 55 },  // normal
  { multiplier: 4.50, sellThrough: 18 },  // very slow — clearance candidate
  { multiplier: 0.60, sellThrough: 72 },  // fast mover
  { multiplier: 2.40, sellThrough: 31 },  // slow mover
  { multiplier: 0.90, sellThrough: 62 },  // normal
  { multiplier: 1.80, sellThrough: 42 },  // normal-slow
  { multiplier: 5.10, sellThrough: 16 },  // very slow
  { multiplier: 0.25, sellThrough: 88 },  // very fast mover
  { multiplier: 1.40, sellThrough: 48 },  // normal
]

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS base_products (
      sku_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price_per_unit REAL NOT NULL,
      retail_price REAL NOT NULL,
      cost_price REAL NOT NULL,
      markdown_pct REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      units_sold INTEGER NOT NULL DEFAULT 0,
      total_revenue REAL NOT NULL DEFAULT 0,
      avg_qty_per_tx REAL NOT NULL DEFAULT 1,
      transaction_count INTEGER NOT NULL DEFAULT 0,
      current_stock INTEGER NOT NULL DEFAULT 0,
      weeks_of_supply REAL NOT NULL DEFAULT 0,
      sell_through_rate REAL NOT NULL DEFAULT 0,
      inventory_value REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS live_products (
      sku_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price_per_unit REAL NOT NULL,
      retail_price REAL NOT NULL,
      cost_price REAL NOT NULL,
      markdown_pct REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      units_sold INTEGER NOT NULL DEFAULT 0,
      total_revenue REAL NOT NULL DEFAULT 0,
      avg_qty_per_tx REAL NOT NULL DEFAULT 1,
      transaction_count INTEGER NOT NULL DEFAULT 0,
      current_stock INTEGER NOT NULL DEFAULT 0,
      weeks_of_supply REAL NOT NULL DEFAULT 0,
      sell_through_rate REAL NOT NULL DEFAULT 0,
      inventory_value REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS action_log (
      action_id TEXT PRIMARY KEY,
      agent_source TEXT NOT NULL,
      action_type TEXT NOT NULL,
      title TEXT NOT NULL,
      affected_skus TEXT NOT NULL DEFAULT '[]',
      mutations TEXT NOT NULL DEFAULT '[]',
      changes_made TEXT NOT NULL DEFAULT '[]',
      before_snapshot TEXT NOT NULL DEFAULT '[]',
      approved_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS agent_state (
      agent_name        TEXT NOT NULL,
      sku_id            TEXT NOT NULL,
      last_action_type  TEXT NOT NULL DEFAULT '',
      last_action_value REAL NOT NULL DEFAULT 0,
      last_run_at       TEXT NOT NULL,
      run_count         INTEGER NOT NULL DEFAULT 0,
      escalation_level  INTEGER NOT NULL DEFAULT 0,
      outcome_score     REAL NOT NULL DEFAULT 0,
      outcome_checked_at TEXT,
      last_action_id    TEXT,
      PRIMARY KEY (agent_name, sku_id)
    );

    CREATE TABLE IF NOT EXISTS product_snapshots (
      snapshot_at       TEXT NOT NULL,
      sku_id            TEXT NOT NULL,
      sell_through_rate REAL NOT NULL,
      current_stock     INTEGER NOT NULL,
      weeks_of_supply   REAL NOT NULL,
      retail_price      REAL NOT NULL,
      inventory_value   REAL NOT NULL,
      status            TEXT NOT NULL,
      PRIMARY KEY (snapshot_at, sku_id)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_sku
      ON product_snapshots (sku_id, snapshot_at DESC);

    CREATE TABLE IF NOT EXISTS ai_response_cache (
      cache_key    TEXT PRIMARY KEY,
      response_json TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connections (
      id                TEXT PRIMARY KEY,
      platform          TEXT NOT NULL UNIQUE,
      display_name      TEXT NOT NULL,
      auth_type         TEXT NOT NULL,
      credentials       TEXT NOT NULL DEFAULT '{}',
      status            TEXT NOT NULL DEFAULT 'not_connected',
      connected_account TEXT,
      read_permissions  TEXT NOT NULL DEFAULT '[]',
      write_permissions TEXT NOT NULL DEFAULT '[]',
      guardrails        TEXT NOT NULL DEFAULT '{}',
      created_at        TEXT NOT NULL,
      last_synced_at    TEXT
    );
  `)

  // Migrations for existing DBs
  try {
    db.exec(`ALTER TABLE action_log ADD COLUMN before_snapshot TEXT NOT NULL DEFAULT '[]'`)
  } catch { /* column already exists */ }

  // agent_state new columns (added in v2)
  const agentStateMigrations = [
    `ALTER TABLE agent_state ADD COLUMN outcome_score REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE agent_state ADD COLUMN outcome_checked_at TEXT`,
    `ALTER TABLE agent_state ADD COLUMN last_action_id TEXT`,
    // v3: suppress_until prevents re-flagging during stabilisation windows
    `ALTER TABLE agent_state ADD COLUMN suppress_until TEXT`,
  ]
  for (const sql of agentStateMigrations) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }
}

function seedFromCsv(db: Database.Database): void {
  let raw: string
  try {
    raw = fs.readFileSync(CSV_PATH, 'utf-8')
  } catch {
    console.error(`[seed] CSV not found at ${CSV_PATH}`)
    return
  }

  const { data } = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true })

  // Group rows by (category, price_per_unit) — one SKU per combination
  const groups = new Map<string, typeof data>()
  for (const row of data) {
    const key = `${row['Product Category']}||${row['Price per Unit']}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  const catPrefixes: Record<string, string> = { Beauty: 'BT', Clothing: 'CL', Electronics: 'EL' }
  const catCounters: Record<string, number> = {}
  let scenarioIdx = 0

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO base_products VALUES (
      @sku_id, @name, @category, @price_per_unit, @retail_price, @cost_price,
      @markdown_pct, @status, @units_sold, @total_revenue, @avg_qty_per_tx,
      @transaction_count, @current_stock, @weeks_of_supply, @sell_through_rate, @inventory_value
    )
  `)

  const insertMany = db.transaction((rows: Record<string, unknown>[]) => {
    for (const row of rows) insertStmt.run(row)
  })

  const skus: Record<string, unknown>[] = []

  for (const [key, rows] of groups) {
    const [category, priceStr] = key.split('||')
    const price = parseFloat(priceStr)
    const prefix = catPrefixes[category] || 'XX'
    catCounters[category] = (catCounters[category] || 0) + 1
    const skuId = `${prefix}-${String(catCounters[category]).padStart(3, '0')}`

    const unitsSold = rows.reduce((s, r) => s + parseInt(r['Quantity'] || '0'), 0)
    const totalRevenue = rows.reduce((s, r) => s + parseFloat(r['Total Amount'] || '0'), 0)
    const txCount = rows.length
    const avgQty = unitsSold / Math.max(txCount, 1)
    const costPrice = price * 0.55

    const scenario = SCENARIOS[scenarioIdx % SCENARIOS.length]
    scenarioIdx++

    const currentStock = Math.max(1, Math.round(unitsSold * scenario.multiplier))
    const weeksOfSupply = currentStock / Math.max(unitsSold / 52, 0.1)
    const inventoryValue = currentStock * price

    skus.push({
      sku_id: skuId,
      name: SKU_NAMES[category]?.[priceStr] ?? `${category} — $${price}`,
      category,
      price_per_unit: price,
      retail_price: price,
      cost_price: costPrice,
      markdown_pct: 0,
      status: 'active',
      units_sold: unitsSold,
      total_revenue: totalRevenue,
      avg_qty_per_tx: avgQty,
      transaction_count: txCount,
      current_stock: currentStock,
      weeks_of_supply: weeksOfSupply,
      sell_through_rate: scenario.sellThrough,
      inventory_value: inventoryValue,
    })
  }

  insertMany(skus)
  console.log(`[seed] Inserted ${skus.length} SKUs`)
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('synchronous = NORMAL')
    initSchema(_db)

    const baseCount = (_db.prepare('SELECT COUNT(*) as c FROM base_products').get() as { c: number }).c
    if (baseCount === 0) seedFromCsv(_db)

    const liveCount = (_db.prepare('SELECT COUNT(*) as c FROM live_products').get() as { c: number }).c
    if (liveCount === 0) copyBaseToLive(_db)
  }
  return _db
}

export function copyBaseToLive(db: Database.Database): void {
  db.exec('DELETE FROM live_products')
  db.exec('INSERT INTO live_products SELECT * FROM base_products')
}

export function resetDemo(db: Database.Database): void {
  db.transaction(() => {
    db.prepare('DELETE FROM live_products').run()
    db.prepare('INSERT INTO live_products SELECT * FROM base_products').run()
    db.prepare('DELETE FROM action_log').run()
    db.prepare('DELETE FROM agent_state').run()
    db.prepare('DELETE FROM product_snapshots').run()
    db.prepare('DELETE FROM ai_response_cache').run()
  })()
}
