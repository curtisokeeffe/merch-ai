import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dataDir = path.join(process.cwd(), 'data')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  const dbPath = path.join(dataDir, 'v2.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  initSchema(db)
  seedIfEmpty(db)

  return db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_queue (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      impact TEXT NOT NULL,
      confidence REAL NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      actioned_at TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      sku_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      retail_price REAL NOT NULL,
      cost_price REAL NOT NULL,
      current_stock INTEGER NOT NULL DEFAULT 0,
      units_sold_30d INTEGER NOT NULL DEFAULT 0,
      units_sold_90d INTEGER NOT NULL DEFAULT 0,
      sell_through_rate REAL NOT NULL DEFAULT 0,
      weeks_of_supply REAL NOT NULL DEFAULT 0,
      shopify_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS performance_signals (
      id TEXT PRIMARY KEY,
      signal_type TEXT NOT NULL,
      metric TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      impact TEXT NOT NULL,
      severity TEXT NOT NULL,
      source TEXT NOT NULL,
      affected_skus TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'new',
      detected_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_briefs (
      id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      summary TEXT NOT NULL,
      signal_count INTEGER NOT NULL DEFAULT 0,
      critical_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft'
    );

    CREATE TABLE IF NOT EXISTS content_drafts (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      bullets TEXT NOT NULL DEFAULT '[]',
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      collection_suggestions TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      generated_at TEXT NOT NULL,
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pricing_recommendations (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL,
      current_price REAL NOT NULL,
      recommended_price REAL NOT NULL,
      change_pct REAL NOT NULL,
      confidence REAL NOT NULL,
      elasticity REAL NOT NULL DEFAULT -1.5,
      reasoning TEXT NOT NULL,
      projected_sell_through REAL NOT NULL,
      projected_margin_impact TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      actioned_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pricing_guardrails (
      sku_id TEXT PRIMARY KEY,
      min_price REAL NOT NULL,
      max_price REAL NOT NULL,
      max_change_pct REAL NOT NULL DEFAULT 20,
      floor_margin_pct REAL NOT NULL DEFAULT 40
    );

    CREATE TABLE IF NOT EXISTS forecasts (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL,
      forecast_units INTEGER NOT NULL,
      confidence_low INTEGER NOT NULL,
      confidence_high INTEGER NOT NULL,
      period TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'heuristic',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replenishment_orders (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL,
      recommended_qty INTEGER NOT NULL,
      supplier TEXT NOT NULL DEFAULT 'Default Supplier',
      lead_time_days INTEGER NOT NULL DEFAULT 21,
      moq INTEGER NOT NULL DEFAULT 12,
      estimated_cost REAL NOT NULL,
      urgency TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      submitted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS markdown_recommendations (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL,
      current_price REAL NOT NULL,
      recommended_price REAL NOT NULL,
      discount_pct REAL NOT NULL,
      urgency_score REAL NOT NULL,
      weeks_remaining INTEGER NOT NULL,
      projected_sell_through REAL NOT NULL,
      projected_margin_impact TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      bundle_candidate INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      actioned_at TEXT
    );

    CREATE TABLE IF NOT EXISTS promotion_scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku_ids TEXT NOT NULL DEFAULT '[]',
      discount_pct REAL NOT NULL,
      projected_revenue REAL NOT NULL,
      projected_units INTEGER NOT NULL,
      projected_margin_pct REAL NOT NULL,
      scenario_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `)
}

function seedIfEmpty(db: Database.Database) {
  const count = (db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number }).c
  if (count > 0) return

  const now = new Date().toISOString()
  const yesterday = new Date(Date.now() - 86400000).toISOString()
  const twoDaysAgo = new Date(Date.now() - 172800000).toISOString()

  // ── Products ─────────────────────────────────────────────────────────
  const insertProduct = db.prepare(`
    INSERT INTO products (sku_id, name, category, subcategory, retail_price, cost_price,
      current_stock, units_sold_30d, units_sold_90d, sell_through_rate, weeks_of_supply,
      shopify_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `)

  const products = [
    ['CL-001', 'Classic Oxford Shirt',         'Shirts',      'Dress Shirts',  89,  42, 340,  38, 112, 64,  22.5, 'SHP-1001'],
    ['CL-002', 'Slim Fit Chinos',               'Bottoms',     'Chinos',        79,  38,  82,  12,  38, 28,  17.2, 'SHP-1002'],
    ['CL-003', 'Merino Wool Crewneck',          'Knitwear',    'Sweaters',     129,  58, 210,  45, 134, 72,  11.7, 'SHP-1003'],
    ['CL-004', 'Relaxed Linen Blazer',          'Outerwear',   'Blazers',      249, 112,  48,   6,  19, 21,  20.1, 'SHP-1004'],
    ['CL-005', 'Stretch Denim Jeans',           'Bottoms',     'Denim',         99,  45, 175,  52, 158, 78,   8.4, 'SHP-1005'],
    ['CL-006', 'Athletic Performance Shorts',   'Activewear',  'Shorts',        59,  26, 420,  85, 248, 81,  12.4, 'SHP-1006'],
    ['CL-007', 'Quilted Puffer Vest',           'Outerwear',   'Vests',        149,  67, 195,   8,  26, 18,  60.9, 'SHP-1007'],
    ['CL-008', 'Silk Wrap Blouse',              'Tops',        'Blouses',      119,  55,  93,  22,  66, 55,  10.6, 'SHP-1008'],
    ['CL-009', 'Cargo Utility Pants',           'Bottoms',     'Cargo',         89,  40, 260,  14,  44, 32,  46.7, 'SHP-1009'],
    ['CL-010', 'Cashmere V-Neck Cardigan',      'Knitwear',    'Cardigans',    199,  95,  67,   9,  28, 25,  18.6, 'SHP-1010'],
    ['ACC-001', 'Full-Grain Leather Belt',      'Accessories', 'Belts',         69,  29, 520,  88, 258, 82,  14.8, 'SHP-2001'],
    ['ACC-002', 'Waxed Canvas Tote',            'Accessories', 'Bags',          49,  21, 380,  62, 184, 74,  15.3, 'SHP-2002'],
    ['ACC-003', 'Lambswool Tartan Scarf',       'Accessories', 'Scarves',       79,  35, 145,   4,  13, 15,  90.8, 'SHP-2003'],
  ]

  const seedProducts = db.transaction(() => {
    for (const p of products) {
      insertProduct.run(...p, now)
    }
  })
  seedProducts()

  // ── Pricing Guardrails ────────────────────────────────────────────────
  const insertGuardrail = db.prepare(`
    INSERT OR IGNORE INTO pricing_guardrails (sku_id, min_price, max_price, max_change_pct, floor_margin_pct)
    VALUES (?, ?, ?, ?, ?)
  `)
  const guardrailData = [
    ['CL-001',  69,  119, 20, 40],
    ['CL-002',  59,   99, 20, 40],
    ['CL-003',  99,  159, 15, 42],
    ['CL-004', 199,  299, 15, 42],
    ['CL-005',  79,  129, 20, 40],
    ['CL-006',  45,   79, 25, 38],
    ['CL-007', 109,  189, 20, 40],
    ['CL-008',  89,  149, 20, 42],
    ['CL-009',  69,  109, 20, 40],
    ['CL-010', 149,  249, 15, 44],
    ['ACC-001',  49,   89, 25, 38],
    ['ACC-002',  35,   65, 25, 38],
    ['ACC-003',  55,   99, 20, 40],
  ]
  const seedGuardrails = db.transaction(() => {
    for (const g of guardrailData) insertGuardrail.run(...g)
  })
  seedGuardrails()

  // ── Performance Signals ───────────────────────────────────────────────
  const insertSignal = db.prepare(`
    INSERT INTO performance_signals (id, signal_type, metric, title, description,
      recommendation, impact, severity, source, affected_skus, status, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const signals = [
    ['SIG-001', 'anomaly', 'sell_through_rate',
      'Tartan Scarf Approaching Dead Stock',
      'ACC-003 Lambswool Tartan Scarf has 90.8 weeks of supply at current sell rate — far above the 12-week seasonal threshold. Post-holiday demand has collapsed.',
      'Initiate immediate markdown to 35% off. Bundle with CL-010 Cashmere Cardigan as a gift set at $219.',
      '-$2,800 margin risk if unsold at season end', 'critical', 'shopify',
      '["ACC-003"]', 'new', twoDaysAgo],
    ['SIG-002', 'anomaly', 'weeks_of_supply',
      'Puffer Vest Overstock — End of Season Risk',
      'CL-007 Quilted Puffer Vest shows 60.9 WoS with only 8 units sold in 30 days. Winter season ending in 6 weeks creates clearance urgency.',
      'Mark down 25% immediately. Activate email campaign to loyalty segment. Consider bulk discount to wholesale partner.',
      '-$4,100 stranded margin', 'critical', 'netsuite',
      '["CL-007"]', 'new', twoDaysAgo],
    ['SIG-003', 'opportunity', 'sell_through_rate',
      'Athletic Shorts Trending — Reorder Required',
      'CL-006 Athletic Performance Shorts sold 85 units in 30 days (81% STR). Stock of 420 will last ~12.4 weeks but spring demand spike expected in 3 weeks.',
      'Place reorder of 200 units now to avoid stockout during peak Q2 demand. Negotiate volume pricing with supplier.',
      '+$5,900 potential revenue protected', 'high', 'shopify',
      '["CL-006"]', 'new', yesterday],
    ['SIG-004', 'opportunity', 'margin',
      'Oxford Shirt Price Elasticity Opportunity',
      'CL-001 Classic Oxford Shirt maintains strong 64% STR at $89. Competitor analysis shows comparable shirts retailing at $99-$109. Margin upside available.',
      'Test price increase to $95 on 20% of traffic via A/B. If conversion holds within 5%, roll out to full catalogue.',
      '+$1,140/mo estimated margin uplift', 'high', 'sheets',
      '["CL-001"]', 'new', yesterday],
    ['SIG-005', 'alert', 'inventory',
      'Cargo Pants Slow Mover — Inventory Drag',
      'CL-009 Cargo Utility Pants has 46.7 WoS with only 14 units sold in 30 days. 260 units represents $23,400 at cost tied up in slow-moving inventory.',
      'Evaluate markdown to $69 (22% reduction). Consider bundling with CL-001 Oxford Shirt as weekend casual set.',
      '$10,400 cost capital unlocked via clearance', 'medium', 'netsuite',
      '["CL-009"]', 'new', yesterday],
    ['SIG-006', 'opportunity', 'velocity',
      'Denim Jeans High Velocity — Spring Collection Candidate',
      'CL-005 Stretch Denim Jeans is running at 78% STR with 8.4 WoS. Spring marketing campaign should feature this as hero product.',
      'Feature CL-005 in spring email campaign. Increase paid social spend by 30% on this SKU. Ensure reorder is placed by end of week.',
      '+$3,200 incremental revenue from campaign', 'medium', 'shopify',
      '["CL-005"]', 'acknowledged', twoDaysAgo],
    ['SIG-007', 'anomaly', 'conversion',
      'Slim Chinos Underperforming — Low Traffic Conversion',
      'CL-002 Slim Fit Chinos has dropped from 45% to 28% STR over 30 days. Product page bounce rate increased 18%. May indicate sizing/fit issue or competitor pricing pressure.',
      'Review customer reviews for fit feedback. Run a/b test on product imagery. Check competitor pricing — may need to match at $72.',
      '-$890 revenue vs. prior period', 'medium', 'shopify',
      '["CL-002"]', 'new', now],
    ['SIG-008', 'summary', 'overall',
      'Weekly Performance Summary — Week of Apr 14',
      'Overall portfolio sell-through at 52% average. 3 SKUs at critical overstock risk. 2 high-velocity items approaching reorder threshold. Accessories category outperforming at 74% average STR.',
      'Prioritize markdown actions for CL-007 and ACC-003. Place replenishment orders for CL-006 and ACC-001 within 48 hours.',
      'Net portfolio risk: -$6,900 | Opportunity: +$9,100', 'low', 'system',
      '[]', 'new', now],
  ]
  const seedSignals = db.transaction(() => {
    for (const s of signals) insertSignal.run(...s)
  })
  seedSignals()

  // ── Daily Brief ───────────────────────────────────────────────────────
  db.prepare(`
    INSERT INTO daily_briefs (id, generated_at, summary, signal_count, critical_count, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'BRIEF-001',
    now,
    `This week's portfolio analysis reveals two critical overstock situations requiring immediate markdown action — ACC-003 Lambswool Tartan Scarf (90.8 WoS) and CL-007 Quilted Puffer Vest (60.9 WoS) — together representing $6,900 in stranded margin risk as the winter season closes. On the positive side, CL-006 Athletic Performance Shorts and ACC-001 Full-Grain Leather Belt are tracking at 81-82% sell-through and need replenishment orders placed within 48 hours to protect $9,100 in Q2 revenue opportunity. Immediate recommended actions: (1) Markdown ACC-003 to $51 and CL-007 to $112, (2) Place reorder for CL-006 (200 units) and ACC-001 (150 units), (3) Test $95 price on CL-001 Oxford Shirt to capture margin upside.`,
    8, 2, 'published'
  )

  // ── Pricing Recommendations ───────────────────────────────────────────
  const insertPricing = db.prepare(`
    INSERT INTO pricing_recommendations (id, sku_id, current_price, recommended_price,
      change_pct, confidence, elasticity, reasoning, projected_sell_through,
      projected_margin_impact, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const pricingRecs = [
    ['PRC-001', 'CL-001',  89,  95,  6.74, 0.82, -1.4,
      'Strong 64% STR and competitor benchmarking shows room for a $6 increase. A/B test on 20% traffic recommended before full rollout. Elasticity model projects <3% unit volume impact.',
      62, '+$1,140/mo', 'pending', now],
    ['PRC-002', 'CL-003', 129, 119, -7.75, 0.78, -1.6,
      'Merino Wool Crewneck at 72% STR suggests strong demand. Minor price decrease to $119 could push STR above 80% and accelerate sell-through before next season.',
      81, '+$860 sell-through uplift', 'pending', now],
    ['PRC-003', 'CL-007', 149, 112, -24.8, 0.91, -2.1,
      'Puffer Vest is critically overstocked at 60.9 WoS. End-of-season markdown to $112 (25% off) needed to clear inventory before spring. High urgency.',
      45, '-$2,150 margin (vs. -$4,100 if unsold)', 'pending', now],
    ['PRC-004', 'ACC-003',  79,  51, -35.4, 0.94, -2.4,
      'Tartan Scarf at 90.8 WoS is a dead-stock emergency. 35% markdown to $51 is needed immediately. Bundle with knitwear as gift option.',
      55, '-$1,120 margin (vs. -$2,800 write-off)', 'pending', now],
    ['PRC-005', 'CL-006',  59,  64,  8.47, 0.75, -1.3,
      'Athletic Shorts at 81% STR with spring demand spike incoming. Small price increase to $64 tests ceiling while maintaining velocity. Low elasticity in activewear segment.',
      78, '+$425/mo', 'pending', now],
  ]
  const seedPricing = db.transaction(() => {
    for (const p of pricingRecs) insertPricing.run(...p)
  })
  seedPricing()

  // ── Forecasts (Q2 2026) ───────────────────────────────────────────────
  const insertForecast = db.prepare(`
    INSERT INTO forecasts (id, sku_id, forecast_units, confidence_low, confidence_high, period, method, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const forecasts = [
    ['FC-001', 'CL-001', 145, 118, 172, '2026-Q2', 'heuristic', now],
    ['FC-002', 'CL-002',  38,  28,  48, '2026-Q2', 'heuristic', now],
    ['FC-003', 'CL-003', 110,  88, 132, '2026-Q2', 'heuristic', now],
    ['FC-004', 'CL-004',  18,  12,  24, '2026-Q2', 'heuristic', now],
    ['FC-005', 'CL-005', 195, 165, 225, '2026-Q2', 'heuristic', now],
    ['FC-006', 'CL-006', 310, 268, 352, '2026-Q2', 'heuristic', now],
    ['FC-007', 'CL-007',  22,  14,  30, '2026-Q2', 'heuristic', now],
    ['FC-008', 'CL-008',  75,  60,  90, '2026-Q2', 'heuristic', now],
    ['FC-009', 'CL-009',  42,  30,  54, '2026-Q2', 'heuristic', now],
    ['FC-010', 'CL-010',  28,  20,  36, '2026-Q2', 'heuristic', now],
    ['FC-011', 'ACC-001', 268, 228, 308, '2026-Q2', 'heuristic', now],
    ['FC-012', 'ACC-002', 195, 165, 225, '2026-Q2', 'heuristic', now],
    ['FC-013', 'ACC-003',  12,   8,  18, '2026-Q2', 'heuristic', now],
  ]
  const seedForecasts = db.transaction(() => {
    for (const f of forecasts) insertForecast.run(...f)
  })
  seedForecasts()

  // ── Replenishment Orders ──────────────────────────────────────────────
  const insertReplen = db.prepare(`
    INSERT INTO replenishment_orders (id, sku_id, recommended_qty, supplier, lead_time_days,
      moq, estimated_cost, urgency, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const replenOrders = [
    ['REP-001', 'CL-006', 200, 'ActiveWear Supply Co.', 18, 48,  5200, 'urgent', 'draft', now],
    ['REP-002', 'ACC-001', 150, 'Heritage Leather Goods', 21, 24, 4350, 'urgent', 'draft', now],
    ['REP-003', 'CL-001', 120, 'Premium Cotton Mills', 28, 36,  5040, 'normal', 'draft', now],
    ['REP-004', 'CL-005', 100, 'Denim Works International', 21, 24, 4500, 'normal', 'draft', now],
  ]
  const seedReplen = db.transaction(() => {
    for (const r of replenOrders) insertReplen.run(...r)
  })
  seedReplen()

  // ── Markdown Recommendations ──────────────────────────────────────────
  const insertMarkdown = db.prepare(`
    INSERT INTO markdown_recommendations (id, sku_id, current_price, recommended_price,
      discount_pct, urgency_score, weeks_remaining, projected_sell_through,
      projected_margin_impact, reasoning, bundle_candidate, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const markdowns = [
    ['MKD-001', 'ACC-003', 79, 51, 35.4, 0.96, 4,  55,
      '-$1,120 vs -$2,800 write-off',
      'Lambswool Tartan Scarf has 90.8 weeks of supply — the highest in the portfolio. With spring/summer approaching, winter accessories demand will collapse further. Immediate 35% markdown is necessary to clear inventory before cost of carry exceeds salvage value.',
      1, 'pending', now],
    ['MKD-002', 'CL-007', 149, 112, 24.8, 0.88, 6, 45,
      '-$2,150 vs -$4,100 write-off',
      'Quilted Puffer Vest at 60.9 WoS is the second highest overstock risk. End-of-winter season gives a 6-week window. Markdown to $112 (25% off) should drive enough velocity to clear before storage costs accumulate.',
      0, 'pending', now],
    ['MKD-003', 'CL-009', 89, 69, 22.5, 0.62, 12, 52,
      '-$1,840 clearance vs $10,400 carry cost',
      'Cargo Utility Pants at 46.7 WoS is a moderate urgency clearance candidate. 22% discount to $69 should unlock the value-conscious customer segment and reduce inventory carrying costs on 260 units.',
      1, 'pending', now],
    ['MKD-004', 'CL-002', 79, 65, 17.7, 0.54, 16, 42,
      '-$420 margin vs improved velocity',
      'Slim Fit Chinos has declined from 45% to 28% STR — possible fit or competitive pricing issue. A modest 18% price reduction tests whether price elasticity can recover volume. Bundle candidate with Oxford Shirt.',
      1, 'pending', now],
  ]
  const seedMarkdowns = db.transaction(() => {
    for (const m of markdowns) insertMarkdown.run(...m)
  })
  seedMarkdowns()

  // ── Content Drafts ────────────────────────────────────────────────────
  const insertDraft = db.prepare(`
    INSERT INTO content_drafts (id, sku_id, title, description, bullets, seo_title,
      seo_description, tags, collection_suggestions, status, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const drafts = [
    ['CDR-001', 'CL-001',
      'The Classic Oxford Shirt — Timeless Style, Modern Fit',
      "Crafted from premium 100% cotton poplin, our Classic Oxford Shirt is the cornerstone of a well-built wardrobe. The refined collar, reinforced buttons, and tailored silhouette make it as at home in the boardroom as it is at a weekend brunch. Available in a range of classic colorways, this is the shirt you'll reach for first.",
      '["Premium 100% cotton poplin fabric for breathability and durability","Tailored fit through the chest with comfortable ease through the body","Reinforced mother-of-pearl buttons and double-needle stitching","Machine washable — wrinkle-resistant finish","Available in White, Light Blue, Sky, and Chambray"]',
      'Classic Oxford Shirt | Men\'s Dress Shirts | Free Shipping',
      'Shop our Classic Oxford Shirt — premium cotton poplin, tailored fit, and timeless style. Perfect for work or weekend. Free shipping on orders over $75.',
      '["oxford shirt","mens shirt","dress shirt","cotton shirt","work shirt","classic style"]',
      '["New Arrivals","Office Essentials","The Classic Edit","Gift Ideas for Him"]',
      'approved', yesterday],
    ['CDR-002', 'CL-005',
      'Stretch Denim Jeans — The Everyday Essential',
      "Meet your new go-to denim. Our Stretch Denim Jeans combine the classic five-pocket design with a performance stretch fabric that moves with you all day. A medium indigo wash keeps them versatile enough to dress up or down, while the slim-straight cut flatters every build. These aren't just jeans — they're the pair you'll wear until they're perfectly broken in.",
      '["2% elastane stretch denim for all-day comfort and recovery","Slim-straight cut — versatile from casual to smart-casual","Classic 5-pocket construction with riveted stress points","Mid-rise waist with button fly and belt loops","Fades beautifully with wear — gets better over time"]',
      'Stretch Denim Jeans | Men\'s Jeans | Slim Straight Fit',
      'Our best-selling Stretch Denim Jeans in slim-straight cut. Comfort stretch fabric, mid-rise, 5-pocket. Shop men\'s jeans with free returns.',
      '["denim jeans","stretch jeans","mens jeans","slim fit jeans","everyday jeans","casual"]',
      '["Spring Essentials","The Denim Edit","Weekend Wardrobe","Best Sellers"]',
      'draft', now],
    ['CDR-003', 'ACC-001',
      'Full-Grain Leather Belt — Built to Last a Lifetime',
      "Some accessories are bought for a season. This one is bought for a lifetime. Our Full-Grain Leather Belt is cut from a single piece of premium vegetable-tanned leather — the highest quality grade available. It will develop a rich patina unique to you, becoming more beautiful with every year of wear. The solid brass buckle is built to outlast every pair of trousers you own.",
      '["Full-grain vegetable-tanned leather — highest quality grade","Develops unique patina with age — improves over time","Solid brass roller buckle with antique finish","Width: 35mm — works with both casual and dress trousers","Sizes 28-44 — cut to your exact waist measurement"]',
      'Full-Grain Leather Belt | Men\'s Belts | Lifetime Quality',
      'Our Full-Grain Leather Belt — vegetable-tanned, solid brass buckle, built to last a lifetime. The belt that gets better with age. Free shipping over $75.',
      '["leather belt","full grain leather","mens belt","dress belt","casual belt","lifetime quality"]',
      '["Accessories","Gift Ideas for Him","The Classic Edit","Investment Pieces"]',
      'published', twoDaysAgo],
  ]
  const seedDrafts = db.transaction(() => {
    for (const d of drafts) insertDraft.run(...d)
  })
  seedDrafts()

  // ── Promotion Scenarios ───────────────────────────────────────────────
  const insertScenario = db.prepare(`
    INSERT INTO promotion_scenarios (id, name, sku_ids, discount_pct, projected_revenue,
      projected_units, projected_margin_pct, scenario_notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const scenarios = [
    ['SCN-001', 'Winter Clearance Bundle — Knitwear + Outerwear',
      '["CL-007","CL-010","ACC-003"]', 25, 8420, 74, 38.2,
      'Scenario simulates a 25% blanket discount across winter outerwear and knitwear. At -1.8 elasticity, projects 68% unit uplift from baseline. Margin compression is acceptable given overstock carrying costs. Recommend email campaign to loyalty segment + paid retargeting.',
      twoDaysAgo],
    ['SCN-002', 'Spring Launch — Core Basics Flash Sale',
      '["CL-001","CL-005","CL-006","ACC-001","ACC-002"]', 15, 14600, 212, 42.8,
      'Spring launch 15% flash sale across high-velocity basics. Conservative elasticity of -1.4 given strong brand loyalty. Projected to drive 42% revenue uplift vs. baseline week. Low margin impact due to already-strong STR on these SKUs. Recommend 48-hour flash sale format.',
      yesterday],
  ]
  const seedScenarios = db.transaction(() => {
    for (const s of scenarios) insertScenario.run(...s)
  })
  seedScenarios()

  // ── Action Queue ──────────────────────────────────────────────────────
  const insertAction = db.prepare(`
    INSERT INTO action_queue (id, module, type, title, description, impact, confidence,
      severity, status, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const actions = [
    ['ACT-001', 'pricing', 'markdown',
      'Emergency Markdown: Lambswool Tartan Scarf',
      'ACC-003 has reached critical overstock at 90.8 weeks of supply. Immediate 35% markdown from $79 to $51 required to avoid season-end write-off.',
      '-$1,120 margin vs -$2,800 write-off', 0.94, 'critical', 'pending',
      JSON.stringify({ sku_id: 'ACC-003', action: 'markdown', from: 79, to: 51 }), now],
    ['ACT-002', 'pricing', 'markdown',
      'Season Clearance: Quilted Puffer Vest',
      'CL-007 at 60.9 WoS needs 25% markdown to $112 before end-of-winter to recover margin.',
      '-$2,150 margin vs -$4,100 write-off', 0.88, 'critical', 'pending',
      JSON.stringify({ sku_id: 'CL-007', action: 'markdown', from: 149, to: 112 }), now],
    ['ACT-003', 'forecasting', 'replenishment',
      'Reorder: Athletic Performance Shorts (200 units)',
      'CL-006 is at 12.4 WoS with spring demand spike expected in 3 weeks. Place PO with ActiveWear Supply Co. immediately.',
      '+$5,900 revenue protected', 0.86, 'high', 'pending',
      JSON.stringify({ sku_id: 'CL-006', qty: 200, supplier: 'ActiveWear Supply Co.' }), now],
    ['ACT-004', 'forecasting', 'replenishment',
      'Reorder: Full-Grain Leather Belt (150 units)',
      'ACC-001 at 82% STR and 14.8 WoS. Replenishment needed before summer accessories season peaks.',
      '+$3,200 revenue protected', 0.82, 'high', 'pending',
      JSON.stringify({ sku_id: 'ACC-001', qty: 150, supplier: 'Heritage Leather Goods' }), now],
    ['ACT-005', 'pricing', 'price_increase',
      'Price Test: Classic Oxford Shirt +$6',
      'CL-001 running at 64% STR with competitor analysis showing room to increase from $89 to $95. Low elasticity expected.',
      '+$1,140/mo incremental margin', 0.82, 'high', 'pending',
      JSON.stringify({ sku_id: 'CL-001', action: 'increase', from: 89, to: 95 }), now],
    ['ACT-006', 'content', 'generate',
      'Generate Product Content: Relaxed Linen Blazer',
      'CL-004 Relaxed Linen Blazer has no product content. Spring season makes this a priority — content needed to drive conversion.',
      '+$480 projected conversion uplift', 0.78, 'medium', 'pending',
      JSON.stringify({ sku_id: 'CL-004' }), now],
    ['ACT-007', 'content', 'generate',
      'Generate Product Content: Merino Wool Crewneck',
      'CL-003 lacks SEO-optimized description. Strong seller at 72% STR — better content could push further.',
      '+$320 estimated conversion uplift', 0.74, 'medium', 'pending',
      JSON.stringify({ sku_id: 'CL-003' }), now],
    ['ACT-008', 'promotions', 'bundle',
      'Create Bundle: Tartan Scarf + Cashmere Cardigan Gift Set',
      'ACC-003 and CL-010 are complementary products. Bundle at $219 (vs $278 separate) creates gift set appeal and helps clear overstocked scarf.',
      '+$1,800 estimated bundle revenue', 0.71, 'medium', 'pending',
      JSON.stringify({ skus: ['ACC-003', 'CL-010'], bundle_price: 219 }), now],
    ['ACT-009', 'performance', 'investigate',
      'Investigate: Slim Chinos Conversion Drop',
      'CL-002 STR dropped from 45% to 28% in 30 days. Bounce rate up 18%. Root cause analysis needed before pricing action.',
      'Protect $890 monthly revenue', 0.68, 'medium', 'pending',
      JSON.stringify({ sku_id: 'CL-002', metric: 'conversion_rate' }), now],
    ['ACT-010', 'promotions', 'scenario',
      'Simulate Spring Flash Sale — Core Basics',
      'Run 48-hour 15% flash sale on 5 core basics SKUs to drive spring launch momentum. Simulation needed before commitment.',
      '+$14,600 projected revenue', 0.79, 'medium', 'pending',
      JSON.stringify({ skus: ['CL-001','CL-005','CL-006','ACC-001','ACC-002'], discount: 15 }), now],
  ]
  const seedActions = db.transaction(() => {
    for (const a of actions) insertAction.run(...a)
  })
  seedActions()
}
