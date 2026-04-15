export type AuthType = 'oauth' | 'api_key' | 'database'
export type RiskLevel = 'Low' | 'Medium' | 'High'
export type PlatformCategory =
  | 'Commerce'
  | 'Data Warehouse'
  | 'ERP & Inventory'
  | 'CRM'
  | 'Marketing & Ads'
  | 'Competitor Pricing'
  | 'Notifications'
  | 'Reviews & Demand'
  | 'Audit & Logging'

export interface ReadPermission {
  id: string
  label: string
  description: string
}

export interface WritePermission {
  id: string
  label: string
  description: string
  risk: RiskLevel
  defaultOn: boolean
}

export interface Guardrail {
  id: string
  label: string
  description: string
  defaultValue: number
  min: number
  max: number
  unit: string
}

export interface ApiKeyField {
  id: string
  label: string
  required: boolean
  type?: 'text' | 'password'
}

export interface DatabaseField {
  id: string
  label: string
  type: 'text' | 'password' | 'number'
  placeholder?: string
}

export interface Platform {
  id: string
  name: string
  category: PlatformCategory
  description: string
  logo: string
  authType: AuthType
  docsUrl?: string
  apiKeyFields?: ApiKeyField[]
  databaseFields?: DatabaseField[]
  readPermissions: ReadPermission[]
  writePermissions: WritePermission[]
  guardrails: Guardrail[]
}

// ── Shared definitions ────────────────────────────────────────────────────────

const COMMERCE_GUARDRAILS: Guardrail[] = [
  {
    id: 'max_discount_pct',
    label: 'Maximum discount %',
    description: 'Agent will not apply discounts above this threshold without approval',
    defaultValue: 15, min: 0, max: 80, unit: '%',
  },
  {
    id: 'min_margin_pct',
    label: 'Minimum margin %',
    description: 'Agent will not price below this margin floor',
    defaultValue: 20, min: 0, max: 90, unit: '%',
  },
  {
    id: 'max_skus_per_run',
    label: 'Max SKUs per run',
    description: 'Maximum number of products changed in a single agent run',
    defaultValue: 50, min: 1, max: 500, unit: 'SKUs',
  },
]

const COMMERCE_READ: ReadPermission[] = [
  { id: 'prices_inventory', label: 'Product prices & inventory', description: 'Current pricing and stock levels for all products' },
  { id: 'order_history', label: 'Order history & sales velocity', description: 'Historical orders used to compute sales trends' },
  { id: 'product_metadata', label: 'Product metadata & status', description: 'Tags, collections, and product lifecycle status' },
]

const COMMERCE_WRITE: WritePermission[] = [
  { id: 'update_price', label: 'Update product price', description: 'Change retail price of individual products', risk: 'Medium', defaultOn: true },
  { id: 'update_sale_tag', label: 'Activate or end a sale tag', description: 'Toggle promotional tags and discount codes', risk: 'Medium', defaultOn: true },
  { id: 'update_inventory_status', label: 'Update inventory status', description: 'Mark products as unavailable or back in stock', risk: 'High', defaultOn: false },
]

const WAREHOUSE_READ: ReadPermission[] = [
  { id: 'sales_revenue', label: 'Sales & revenue data', description: 'Transactional sales data and revenue by product' },
  { id: 'margin_cogs', label: 'Margin & COGS data', description: 'Cost of goods sold and margin calculations' },
  { id: 'historical_pricing', label: 'Historical pricing data', description: 'Price change history and promo performance' },
]

const DB_FIELDS: DatabaseField[] = [
  { id: 'host', label: 'Host', type: 'text', placeholder: 'hostname or IP' },
  { id: 'port', label: 'Port', type: 'number', placeholder: '5432' },
  { id: 'database', label: 'Database', type: 'text', placeholder: 'prod_db' },
  { id: 'username', label: 'Username', type: 'text', placeholder: 'service_account' },
  { id: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
]

// ── Platform registry ─────────────────────────────────────────────────────────

export const PLATFORMS: Platform[] = [

  // ── Commerce ──────────────────────────────────────────────────────────────
  {
    id: 'shopify', name: 'Shopify', category: 'Commerce', logo: '🛍️',
    description: 'Read sales data and update product prices',
    authType: 'oauth',
    docsUrl: 'https://help.shopify.com/en/api/getting-started',
    readPermissions: COMMERCE_READ, writePermissions: COMMERCE_WRITE, guardrails: COMMERCE_GUARDRAILS,
  },
  {
    id: 'woocommerce', name: 'WooCommerce', category: 'Commerce', logo: '🛒',
    description: 'Connect your WordPress store for AI-driven pricing',
    authType: 'api_key',
    docsUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
    apiKeyFields: [
      { id: 'consumer_key', label: 'Consumer Key', required: true },
      { id: 'consumer_secret', label: 'Consumer Secret', required: true, type: 'password' },
      { id: 'store_url', label: 'Store URL', required: true },
    ],
    readPermissions: COMMERCE_READ, writePermissions: COMMERCE_WRITE, guardrails: COMMERCE_GUARDRAILS,
  },
  {
    id: 'magento', name: 'Magento', category: 'Commerce', logo: '🏪',
    description: 'Sync catalog and pricing with your Magento store',
    authType: 'api_key',
    docsUrl: 'https://developer.adobe.com/commerce/webapi/',
    apiKeyFields: [
      { id: 'api_token', label: 'API Token', required: true, type: 'password' },
      { id: 'store_url', label: 'Store URL', required: true },
    ],
    readPermissions: COMMERCE_READ, writePermissions: COMMERCE_WRITE, guardrails: COMMERCE_GUARDRAILS,
  },
  {
    id: 'bigcommerce', name: 'BigCommerce', category: 'Commerce', logo: '🏬',
    description: 'Manage pricing and promotions on BigCommerce',
    authType: 'api_key',
    docsUrl: 'https://developer.bigcommerce.com/docs/rest-management/catalog',
    apiKeyFields: [
      { id: 'store_hash', label: 'Store Hash', required: true },
      { id: 'access_token', label: 'Access Token', required: true, type: 'password' },
    ],
    readPermissions: COMMERCE_READ, writePermissions: COMMERCE_WRITE, guardrails: COMMERCE_GUARDRAILS,
  },

  // ── Data Warehouse ────────────────────────────────────────────────────────
  {
    id: 'snowflake', name: 'Snowflake', category: 'Data Warehouse', logo: '❄️',
    description: 'Query sales, margin, and pricing history from Snowflake',
    authType: 'database',
    databaseFields: [
      { id: 'account', label: 'Account Identifier', type: 'text', placeholder: 'xy12345.us-east-1' },
      { id: 'warehouse', label: 'Warehouse', type: 'text', placeholder: 'COMPUTE_WH' },
      { id: 'database', label: 'Database', type: 'text', placeholder: 'PROD_DB' },
      { id: 'schema', label: 'Schema', type: 'text', placeholder: 'PUBLIC' },
      { id: 'username', label: 'Username', type: 'text', placeholder: 'service_account' },
      { id: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    ],
    readPermissions: WAREHOUSE_READ, writePermissions: [], guardrails: [],
  },
  {
    id: 'bigquery', name: 'Google BigQuery', category: 'Data Warehouse', logo: '📊',
    description: 'Pull analytics and revenue data from BigQuery',
    authType: 'database',
    databaseFields: [
      { id: 'project_id', label: 'Project ID', type: 'text', placeholder: 'my-project-123' },
      { id: 'dataset', label: 'Dataset', type: 'text', placeholder: 'analytics' },
      { id: 'service_account_json', label: 'Service Account JSON', type: 'password', placeholder: 'Paste JSON key...' },
    ],
    readPermissions: WAREHOUSE_READ, writePermissions: [], guardrails: [],
  },
  {
    id: 'redshift', name: 'Amazon Redshift', category: 'Data Warehouse', logo: '🔴',
    description: 'Connect to Redshift for historical sales and cost data',
    authType: 'database',
    databaseFields: DB_FIELDS.map(f => f.id === 'port' ? { ...f, placeholder: '5439' } : f),
    readPermissions: WAREHOUSE_READ, writePermissions: [], guardrails: [],
  },
  {
    id: 'postgresql', name: 'PostgreSQL', category: 'Data Warehouse', logo: '🐘',
    description: 'Read from your Postgres database for custom data models',
    authType: 'database',
    databaseFields: DB_FIELDS,
    readPermissions: WAREHOUSE_READ, writePermissions: [], guardrails: [],
  },

  // ── ERP & Inventory ───────────────────────────────────────────────────────
  {
    id: 'netsuite', name: 'NetSuite', category: 'ERP & Inventory', logo: '📁',
    description: 'Sync inventory and financial data from NetSuite ERP',
    authType: 'oauth',
    readPermissions: [
      { id: 'inventory_levels', label: 'Inventory levels', description: 'Current stock across all warehouses' },
      { id: 'purchase_orders', label: 'Purchase orders', description: 'Open and historical PO data' },
      { id: 'financial_data', label: 'Financial data', description: 'COGS, margins, and P&L data' },
    ],
    writePermissions: [
      { id: 'update_inventory', label: 'Update inventory levels', description: 'Adjust stock counts in NetSuite', risk: 'High', defaultOn: false },
      { id: 'create_po', label: 'Create purchase orders', description: 'Raise new POs for low-stock items', risk: 'High', defaultOn: false },
    ],
    guardrails: [
      { id: 'max_po_value', label: 'Max PO value ($)', description: 'Agent will not create POs above this value without approval', defaultValue: 5000, min: 100, max: 1000000, unit: '$' },
    ],
  },
  {
    id: 'sap', name: 'SAP', category: 'ERP & Inventory', logo: '🏢',
    description: 'Connect SAP for enterprise inventory and procurement data',
    authType: 'api_key',
    docsUrl: 'https://api.sap.com/',
    apiKeyFields: [
      { id: 'client_id', label: 'Client ID', required: true },
      { id: 'client_secret', label: 'Client Secret', required: true, type: 'password' },
      { id: 'base_url', label: 'API Base URL', required: true },
    ],
    readPermissions: [
      { id: 'inventory', label: 'Inventory data', description: 'Stock levels and warehouse locations' },
      { id: 'procurement', label: 'Procurement data', description: 'Purchase orders and supplier info' },
      { id: 'financial', label: 'Financial data', description: 'Costs, margins, and P&L' },
    ],
    writePermissions: [
      { id: 'update_inventory_status', label: 'Update inventory status', description: 'Mark stock as reserved or available', risk: 'High', defaultOn: false },
    ],
    guardrails: [],
  },
  {
    id: 'cin7', name: 'Cin7', category: 'ERP & Inventory', logo: '📦',
    description: 'Read inventory and sales orders from Cin7',
    authType: 'api_key',
    docsUrl: 'https://api.cin7.com/api/',
    apiKeyFields: [
      { id: 'api_id', label: 'API ID', required: true },
      { id: 'api_key', label: 'API Key', required: true, type: 'password' },
    ],
    readPermissions: [
      { id: 'inventory', label: 'Inventory levels', description: 'Current stock across all locations' },
      { id: 'sales_orders', label: 'Sales orders', description: 'Order history and fulfillment data' },
    ],
    writePermissions: [
      { id: 'update_stock', label: 'Update stock levels', description: 'Adjust inventory counts in Cin7', risk: 'High', defaultOn: false },
    ],
    guardrails: [],
  },
  {
    id: 'brightpearl', name: 'Brightpearl', category: 'ERP & Inventory', logo: '💎',
    description: 'Sync orders and inventory from Brightpearl',
    authType: 'api_key',
    docsUrl: 'https://api-docs.brightpearl.com/',
    apiKeyFields: [
      { id: 'account_code', label: 'Account Code', required: true },
      { id: 'api_token', label: 'API Token', required: true, type: 'password' },
    ],
    readPermissions: [
      { id: 'inventory', label: 'Inventory data', description: 'Stock levels and product data' },
      { id: 'order_data', label: 'Order data', description: 'Sales and purchase orders' },
    ],
    writePermissions: [
      { id: 'update_stock', label: 'Update stock', description: 'Adjust inventory in Brightpearl', risk: 'High', defaultOn: false },
    ],
    guardrails: [],
  },

  // ── CRM ───────────────────────────────────────────────────────────────────
  {
    id: 'salesforce', name: 'Salesforce', category: 'CRM', logo: '☁️',
    description: 'Read pipeline data and update deal stages',
    authType: 'oauth',
    readPermissions: [
      { id: 'customer_data', label: 'Customer data', description: 'Accounts, contacts, and customer profiles' },
      { id: 'opportunity_pipeline', label: 'Opportunity pipeline', description: 'Open deals and forecasted revenue' },
    ],
    writePermissions: [
      { id: 'update_opportunity', label: 'Update opportunity stage', description: 'Move deals through the pipeline', risk: 'Medium', defaultOn: true },
      { id: 'create_task', label: 'Create tasks', description: 'Log follow-up tasks for reps', risk: 'Low', defaultOn: true },
    ],
    guardrails: [],
  },
  {
    id: 'hubspot', name: 'HubSpot', category: 'CRM', logo: '🟠',
    description: 'Sync contacts and deals, trigger marketing workflows',
    authType: 'oauth',
    readPermissions: [
      { id: 'contact_data', label: 'Contact data', description: 'Customer contacts and segmentation' },
      { id: 'deal_pipeline', label: 'Deal pipeline', description: 'Deals and revenue forecasting' },
      { id: 'campaign_performance', label: 'Campaign performance', description: 'Email open rates and campaign metrics' },
    ],
    writePermissions: [
      { id: 'update_deal_stage', label: 'Update deal stage', description: 'Advance or regress deals in the pipeline', risk: 'Medium', defaultOn: true },
      { id: 'enroll_sequence', label: 'Enroll contacts in sequences', description: 'Add contacts to email sequences', risk: 'Medium', defaultOn: true },
    ],
    guardrails: [],
  },
  {
    id: 'klaviyo', name: 'Klaviyo', category: 'CRM', logo: '📧',
    description: 'Read email metrics and trigger marketing flows',
    authType: 'api_key',
    docsUrl: 'https://developers.klaviyo.com/en/docs',
    apiKeyFields: [
      { id: 'private_api_key', label: 'Private API Key', required: true, type: 'password' },
    ],
    readPermissions: [
      { id: 'email_engagement', label: 'Email engagement metrics', description: 'Open rates, click rates, and revenue per email' },
      { id: 'segment_data', label: 'Segment data', description: 'Customer segments and list membership' },
      { id: 'campaign_performance', label: 'Campaign performance', description: 'Campaign-level revenue and conversion data' },
    ],
    writePermissions: [
      { id: 'trigger_flow', label: 'Trigger flows', description: 'Launch automation flows for specific segments', risk: 'Medium', defaultOn: true },
      { id: 'update_segment', label: 'Update segment membership', description: 'Add or remove customers from segments', risk: 'Low', defaultOn: true },
    ],
    guardrails: [],
  },

  // ── Marketing & Ads ───────────────────────────────────────────────────────
  {
    id: 'google_ads', name: 'Google Ads', category: 'Marketing & Ads', logo: '📢',
    description: 'Read ad spend and adjust campaign budgets based on performance',
    authType: 'oauth',
    readPermissions: [
      { id: 'campaign_performance', label: 'Campaign performance', description: 'Impressions, clicks, CPC, and ROAS by campaign' },
      { id: 'spend_data', label: 'Spend data', description: 'Daily and lifetime spend across campaigns' },
    ],
    writePermissions: [
      { id: 'pause_campaign', label: 'Pause or resume campaigns', description: 'Enable or disable campaigns based on performance thresholds', risk: 'High', defaultOn: false },
      { id: 'adjust_budget', label: 'Adjust campaign budgets', description: 'Increase or decrease daily budgets', risk: 'High', defaultOn: false },
      { id: 'update_bid', label: 'Update bid strategy', description: 'Change target CPA or ROAS bid goals', risk: 'Medium', defaultOn: false },
    ],
    guardrails: [
      { id: 'max_budget_change_pct', label: 'Max budget change %', description: 'Maximum budget increase or decrease per run', defaultValue: 20, min: 1, max: 100, unit: '%' },
    ],
  },
  {
    id: 'meta_ads', name: 'Meta Ads', category: 'Marketing & Ads', logo: '🎯',
    description: 'Monitor Meta ad spend and performance, adjust budgets',
    authType: 'oauth',
    readPermissions: [
      { id: 'campaign_metrics', label: 'Campaign metrics', description: 'Reach, impressions, and ROAS by ad set' },
      { id: 'audience_data', label: 'Audience data', description: 'Audience size and targeting parameters' },
    ],
    writePermissions: [
      { id: 'pause_adset', label: 'Pause or resume ad sets', description: 'Stop or start ad sets based on performance', risk: 'High', defaultOn: false },
      { id: 'adjust_budget', label: 'Adjust ad budgets', description: 'Change daily or lifetime budgets', risk: 'High', defaultOn: false },
    ],
    guardrails: [
      { id: 'max_budget_change_pct', label: 'Max budget change %', description: 'Maximum budget change per agent run', defaultValue: 20, min: 1, max: 100, unit: '%' },
    ],
  },
  {
    id: 'ga4', name: 'Google Analytics 4', category: 'Marketing & Ads', logo: '📈',
    description: 'Read traffic, conversion, and user behavior data',
    authType: 'oauth',
    readPermissions: [
      { id: 'traffic_data', label: 'Traffic data', description: 'Sessions, users, and acquisition channels' },
      { id: 'conversion_data', label: 'Conversion data', description: 'Goal completions and funnel metrics' },
      { id: 'user_behavior', label: 'User behavior', description: 'Page views, bounce rate, and engagement' },
    ],
    writePermissions: [], guardrails: [],
  },
  {
    id: 'triple_whale', name: 'Triple Whale', category: 'Marketing & Ads', logo: '🐋',
    description: 'Read blended ROAS, attribution, and cohort LTV data',
    authType: 'api_key',
    docsUrl: 'https://developers.triplewhale.com/',
    apiKeyFields: [{ id: 'api_key', label: 'API Key', required: true, type: 'password' }],
    readPermissions: [
      { id: 'blended_roas', label: 'Blended ROAS', description: 'Blended return on ad spend across all channels' },
      { id: 'attribution', label: 'Attribution data', description: 'Multi-touch attribution by channel and campaign' },
      { id: 'cohort_ltv', label: 'Cohort LTV', description: 'Customer lifetime value by acquisition cohort' },
    ],
    writePermissions: [], guardrails: [],
  },

  // ── Competitor Pricing ────────────────────────────────────────────────────
  {
    id: 'prisync', name: 'Prisync', category: 'Competitor Pricing', logo: '🔎',
    description: 'Monitor competitor prices and receive price change alerts',
    authType: 'api_key',
    docsUrl: 'https://prisync.com/developer/',
    apiKeyFields: [{ id: 'api_key', label: 'API Key', required: true, type: 'password' }],
    readPermissions: [
      { id: 'competitor_prices', label: 'Competitor prices', description: 'Current prices from tracked competitors' },
      { id: 'price_change_alerts', label: 'Price change alerts', description: 'Notifications when competitors change prices' },
    ],
    writePermissions: [], guardrails: [],
  },
  {
    id: 'wiser', name: 'Wiser', category: 'Competitor Pricing', logo: '🔍',
    description: 'Access real-time competitive pricing and market position data',
    authType: 'api_key',
    docsUrl: 'https://wiser.com/resources/',
    apiKeyFields: [{ id: 'api_key', label: 'API Key', required: true, type: 'password' }],
    readPermissions: [
      { id: 'competitor_pricing', label: 'Competitor pricing data', description: 'Real-time prices from tracked competitors' },
      { id: 'market_position', label: 'Market position', description: 'How your prices rank vs competitors' },
    ],
    writePermissions: [], guardrails: [],
  },
  {
    id: 'skuuudle', name: 'Skuuudle', category: 'Competitor Pricing', logo: '📡',
    description: 'Pull competitive pricing intelligence and matching data',
    authType: 'api_key',
    docsUrl: 'https://skuuudle.com/',
    apiKeyFields: [{ id: 'api_key', label: 'API Key', required: true, type: 'password' }],
    readPermissions: [
      { id: 'pricing_intelligence', label: 'Competitive pricing intelligence', description: 'Matched competitor SKU prices' },
    ],
    writePermissions: [], guardrails: [],
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  {
    id: 'slack', name: 'Slack', category: 'Notifications', logo: '💬',
    description: 'Send approval requests and change summaries to Slack',
    authType: 'oauth',
    readPermissions: [],
    writePermissions: [
      { id: 'send_approvals', label: 'Send approval request messages', description: 'Post messages asking for action approval', risk: 'Low', defaultOn: true },
      { id: 'send_summaries', label: 'Send change summary notifications', description: 'Post daily summaries of completed agent actions', risk: 'Low', defaultOn: true },
    ],
    guardrails: [],
  },
  {
    id: 'email_smtp', name: 'Email (SMTP)', category: 'Notifications', logo: '✉️',
    description: 'Send alerts and reports via your email server',
    authType: 'database',
    databaseFields: [
      { id: 'host', label: 'SMTP Host', type: 'text', placeholder: 'smtp.example.com' },
      { id: 'port', label: 'Port', type: 'number', placeholder: '587' },
      { id: 'username', label: 'Username', type: 'text', placeholder: 'alerts@example.com' },
      { id: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
      { id: 'from_address', label: 'From Address', type: 'text', placeholder: 'MerchAI <alerts@example.com>' },
    ],
    readPermissions: [],
    writePermissions: [
      { id: 'send_alerts', label: 'Send alert emails', description: 'Email alerts for high-urgency signals', risk: 'Low', defaultOn: true },
      { id: 'send_reports', label: 'Send summary reports', description: 'Weekly impact and performance reports', risk: 'Low', defaultOn: true },
    ],
    guardrails: [],
  },
  {
    id: 'microsoft_teams', name: 'Microsoft Teams', category: 'Notifications', logo: '👥',
    description: 'Post agent updates and approvals to Teams channels',
    authType: 'oauth',
    readPermissions: [],
    writePermissions: [
      { id: 'send_messages', label: 'Send messages to channels', description: 'Post notifications to configured Teams channels', risk: 'Low', defaultOn: true },
      { id: 'post_approvals', label: 'Post approval cards', description: 'Send interactive approval cards to reviewers', risk: 'Low', defaultOn: true },
    ],
    guardrails: [],
  },
  {
    id: 'pagerduty', name: 'PagerDuty', category: 'Notifications', logo: '🚨',
    description: 'Trigger incidents for critical stockouts or pricing anomalies',
    authType: 'api_key',
    docsUrl: 'https://developer.pagerduty.com/',
    apiKeyFields: [
      { id: 'api_key', label: 'API Key', required: true, type: 'password' },
      { id: 'service_id', label: 'Service ID', required: true },
    ],
    readPermissions: [],
    writePermissions: [
      { id: 'trigger_incident', label: 'Trigger incidents', description: 'Page on-call team for critical inventory or pricing issues', risk: 'High', defaultOn: false },
      { id: 'acknowledge_incident', label: 'Acknowledge incidents', description: 'Mark agent-triggered incidents as acknowledged', risk: 'Medium', defaultOn: false },
    ],
    guardrails: [],
  },

  // ── Reviews & Demand ──────────────────────────────────────────────────────
  {
    id: 'yotpo', name: 'Yotpo', category: 'Reviews & Demand', logo: '⭐',
    description: 'Read product reviews and ratings to inform pricing signals',
    authType: 'api_key',
    docsUrl: 'https://core-api.yotpo.com/reference/',
    apiKeyFields: [
      { id: 'app_key', label: 'App Key', required: true },
      { id: 'secret_key', label: 'Secret Key', required: true, type: 'password' },
    ],
    readPermissions: [
      { id: 'product_reviews', label: 'Product reviews', description: 'Customer reviews and sentiment data' },
      { id: 'ratings', label: 'Ratings', description: 'Average star ratings by product' },
    ],
    writePermissions: [], guardrails: [],
  },
  {
    id: 'bazaarvoice', name: 'Bazaarvoice', category: 'Reviews & Demand', logo: '🗣️',
    description: 'Pull review volume and sentiment to detect demand trends',
    authType: 'api_key',
    docsUrl: 'https://developer.bazaarvoice.com/',
    apiKeyFields: [{ id: 'passkey', label: 'API Passkey', required: true, type: 'password' }],
    readPermissions: [
      { id: 'reviews', label: 'Reviews & ratings', description: 'Full review content and rating distributions' },
      { id: 'content_stats', label: 'Content statistics', description: 'Review volume and average rating trends' },
    ],
    writePermissions: [], guardrails: [],
  },

  // ── Audit & Logging ───────────────────────────────────────────────────────
  {
    id: 'datadog', name: 'Datadog', category: 'Audit & Logging', logo: '🐕',
    description: 'Send agent run metrics and custom events to Datadog',
    authType: 'api_key',
    docsUrl: 'https://docs.datadoghq.com/api/latest/',
    apiKeyFields: [
      { id: 'api_key', label: 'API Key', required: true, type: 'password' },
      { id: 'app_key', label: 'Application Key', required: true, type: 'password' },
    ],
    readPermissions: [],
    writePermissions: [
      { id: 'send_metrics', label: 'Send custom metrics', description: 'Forward agent run stats to Datadog', risk: 'Low', defaultOn: true },
      { id: 'create_events', label: 'Create events', description: 'Log significant agent decisions as Datadog events', risk: 'Low', defaultOn: true },
    ],
    guardrails: [],
  },
  {
    id: 'segment', name: 'Segment', category: 'Audit & Logging', logo: '🔷',
    description: 'Track agent actions as Segment events for analytics pipelines',
    authType: 'api_key',
    docsUrl: 'https://segment.com/docs/connections/sources/',
    apiKeyFields: [{ id: 'write_key', label: 'Write Key', required: true, type: 'password' }],
    readPermissions: [],
    writePermissions: [
      { id: 'send_events', label: 'Send tracking events', description: 'Record agent actions as Segment track() calls', risk: 'Low', defaultOn: true },
      { id: 'create_traits', label: 'Create traits', description: 'Annotate SKU or user profiles with agent metadata', risk: 'Low', defaultOn: true },
    ],
    guardrails: [],
  },
]
