// Shared TypeScript interfaces for merch-ai-v2

export interface ActionQueueItem {
  id: string
  module: 'performance' | 'content' | 'pricing' | 'forecasting' | 'promotions'
  type: string
  title: string
  description: string
  impact: string
  confidence: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'pending' | 'approved' | 'rejected' | 'applied'
  payload: string
  created_at: string
  actioned_at?: string
}

export interface Product {
  sku_id: string
  name: string
  category: string
  subcategory?: string
  retail_price: number
  cost_price: number
  current_stock: number
  units_sold_30d: number
  units_sold_90d: number
  sell_through_rate: number
  weeks_of_supply: number
  shopify_id?: string
  status: string
  created_at: string
}

export interface PerformanceSignal {
  id: string
  signal_type: 'anomaly' | 'opportunity' | 'alert' | 'summary'
  metric: string
  title: string
  description: string
  recommendation: string
  impact: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  source: 'shopify' | 'netsuite' | 'lightspeed' | 'sheets' | 'system'
  affected_skus: string
  status: 'new' | 'acknowledged' | 'resolved'
  detected_at: string
}

export interface DailyBrief {
  id: string
  generated_at: string
  summary: string
  signal_count: number
  critical_count: number
  status: string
}

export interface ContentDraft {
  id: string
  sku_id: string
  title: string
  description: string
  bullets: string
  seo_title: string
  seo_description: string
  tags: string
  collection_suggestions: string
  status: 'draft' | 'approved' | 'published' | 'rejected'
  generated_at: string
  published_at?: string
}

export interface PricingRecommendation {
  id: string
  sku_id: string
  current_price: number
  recommended_price: number
  change_pct: number
  confidence: number
  elasticity: number
  reasoning: string
  projected_sell_through: number
  projected_margin_impact: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  actioned_at?: string
}

export interface PricingGuardrail {
  sku_id: string
  min_price: number
  max_price: number
  max_change_pct: number
  floor_margin_pct: number
}

export interface Forecast {
  id: string
  sku_id: string
  forecast_units: number
  confidence_low: number
  confidence_high: number
  period: string
  method: string
  created_at: string
}

export interface ReplenishmentOrder {
  id: string
  sku_id: string
  recommended_qty: number
  supplier: string
  lead_time_days: number
  moq: number
  estimated_cost: number
  urgency: 'urgent' | 'normal' | 'low'
  status: 'draft' | 'submitted' | 'cancelled'
  created_at: string
  submitted_at?: string
}

export interface MarkdownRecommendation {
  id: string
  sku_id: string
  current_price: number
  recommended_price: number
  discount_pct: number
  urgency_score: number
  weeks_remaining: number
  projected_sell_through: number
  projected_margin_impact: string
  reasoning: string
  bundle_candidate: number
  status: 'pending' | 'approved' | 'rejected' | 'scheduled'
  created_at: string
  actioned_at?: string
}

export interface PromotionScenario {
  id: string
  name: string
  sku_ids: string
  discount_pct: number
  projected_revenue: number
  projected_units: number
  projected_margin_pct: number
  scenario_notes: string
  created_at: string
}

// Joined types (with product info)
export interface PricingRecWithProduct extends PricingRecommendation {
  product_name: string
  category: string
}

export interface ForecastWithProduct extends Forecast {
  product_name: string
  category: string
  current_stock: number
  weeks_of_supply: number
  cost_price: number
  retail_price: number
}

export interface ReplenishmentWithProduct extends ReplenishmentOrder {
  product_name: string
  category: string
}

export interface MarkdownRecWithProduct extends MarkdownRecommendation {
  product_name: string
  category: string
}

export interface ContentProductRow extends Product {
  draft?: ContentDraft
}
