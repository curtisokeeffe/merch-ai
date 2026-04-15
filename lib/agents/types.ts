import type { ProductRow } from '../db'
import type { Mutation } from '../insights'

export type Severity = 'red' | 'amber' | 'green'

// ── Category-level comparative context ───────────────────────────────────────
// Computed once per run so agents can z-score against category peers,
// not just against the full dataset.

export interface CategoryStats {
  category: string
  count: number
  avg_sell_through: number
  avg_weeks_of_supply: number
  st_stddev: number    // standard deviation of sell_through_rate within this category
  wos_stddev: number   // standard deviation of weeks_of_supply within this category
  p25_sell_through: number
  p75_sell_through: number
  p25_wos: number
  p75_wos: number
}

// ── Trend detection ───────────────────────────────────────────────────────────

export interface TrendData {
  sell_through_velocity: number       // percentage-points per day (+ve = improving, -ve = declining)
  sell_through_acceleration: number   // change in velocity (2nd derivative, pts/day²; -ve = decelerating)
  stock_velocity: number              // units per day (-ve = depleting = good for overstocked)
  wos_trend: 'improving' | 'worsening' | 'stable'
  days_since_snapshot: number         // 0 = no prior snapshot
  has_trend_data: boolean
  projected_sell_through_30d: number  // extrapolated ST rate in 30 days (clamped 0–100)
  early_warning: boolean              // true if trajectory will breach a threshold within 30 days
}

// ── Outcome feedback ──────────────────────────────────────────────────────────

export interface OutcomeRecord {
  sku_id: string
  action_type: string
  approved_at: string
  days_since_action: number
  sell_through_delta: number      // current - before (+ve = improved)
  stock_delta: number             // before - current (+ve = stock sold)
  inventory_value_delta: number   // before - current (+ve = value reduced = good)
  outcome_score: number           // composite: +ve = action worked, -ve = didn't help
  is_mature: boolean              // true if enough time has passed to measure (≥7 days)
  action_magnitude: number        // how large the action was (markdown_pct or price change %)
  action_efficiency: number       // outcome_score / action_magnitude — quality per unit of action
}

// ── Cross-agent coordination ──────────────────────────────────────────────────

export interface RecentAction {
  agent_name: string
  action_type: string
  approved_at: string
  days_ago: number
}

// Strategic opportunity: two actions that complement rather than conflict
export interface StrategicOpportunity {
  sku_id: string
  opportunity: string
  suggested_action: string
  rationale: string
}

// ── Detection ─────────────────────────────────────────────────────────────────

export interface DetectedIssue {
  product: ProductRow
  reason: string                            // deterministic, human-readable
  metrics: Record<string, number | string>  // key values used in detection
  severity: Severity
  urgencyScore: number                      // 0–100; drives sorting / fallback priority
  trend: TrendData | null
  outcomeRecord: OutcomeRecord | null
}

// ── Candidate actions ─────────────────────────────────────────────────────────

export interface CandidateAction {
  type: string           // 'markdown_10' | 'markdown_15' | 'price_up_8' | etc.
  label: string          // "15% Markdown"
  mutations: Mutation[]
  estimatedImpact: string
  priority: number       // 1 = highest priority; used as fallback when AI is unavailable
  constraintErrors: string[]
  // Refinement bounds — AI may interpolate within these
  refinementField?: string   // e.g. 'markdown_pct' or 'price_multiplier'
  refinementMin?: number
  refinementMax?: number
}

// ── Agent state (persisted in SQLite agent_state table) ───────────────────────

export interface AgentStateRow {
  agent_name: string
  sku_id: string
  last_action_type: string
  last_action_value: number
  last_run_at: string
  run_count: number
  escalation_level: number
  outcome_score: number
  outcome_checked_at: string | null
  last_action_id: string | null
  suppress_until: string | null  // ISO timestamp; agent skips this SKU until then
}

// ── Per-SKU run context (passed from agent → runner) ─────────────────────────

export interface SkuRunContext {
  product: ProductRow
  issue: DetectedIssue
  validCandidates: CandidateAction[]
  state: AgentStateRow | null
  escalationLevel: number
}

// ── RunContext passed into each agent's detect() ─────────────────────────────

export interface AgentRunContext {
  products: ProductRow[]
  dp: import('./detection').DataPercentiles
  stateMap: Map<string, AgentStateRow>
  trendMap: Map<string, TrendData>
  outcomeMap: Map<string, OutcomeRecord>
  conflictMap: Map<string, RecentAction[]>    // skuId → recent actions from ALL agents
  categoryStats: Map<string, CategoryStats>   // category → stats for z-score comparison
  strategicOpportunities: Map<string, StrategicOpportunity>  // skuId → opportunity
}

// ── Final signal output ───────────────────────────────────────────────────────

export interface AgentSignal {
  id: string
  agentName: string
  severity: Severity
  title: string
  impact: string
  reason: string
  aiExplanation: string
  metrics: Record<string, number | string>
  selectedAction: CandidateAction
  candidates: CandidateAction[]
  affectedSkus: string[]
  mutations: Mutation[]
  confidence: 'high' | 'medium' | 'low'
  escalationLevel: number
  dataSummary: string
  globalPriorityScore: number
}

// ── AI selection response ─────────────────────────────────────────────────────

export interface AISkuSelection {
  candidateIndex: number
  refinement?: { field: string; value: number }  // optional in-bounds refinement
  reasoning: string
  confidence: number  // 0–1
}

export interface AIAgentResponse {
  selections: Record<string, AISkuSelection>
  groupTitle: string
  groupExplanation: string
}

export interface AIBatchResponse {
  agents: Record<string, AIAgentResponse>
}
