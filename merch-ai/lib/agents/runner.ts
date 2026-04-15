/**
 * Agent Runner v3 — Context-aware, adaptive, cost-efficient
 *
 * Pipeline per run:
 *   1. Snapshot live_products (at most once/hour) → trend data
 *   2. Measure outcomes of past actions → feedback loop
 *   3. Build conflict map + strategic opportunities → cross-agent coordination
 *   4. Build category stats → peer comparison context
 *   5. Each agent: deterministic detection + candidate generation
 *   6. ONE batched AI call for all agents (or skip if cache hit / no AI key)
 *   7. AI refines within bounds — cannot bypass constraints
 *   8. Global ranking + deduplication
 *   9. Update agent_state (deterministic, post-signal, outcome-driven escalation)
 *
 * AI is ONLY called for:
 *   - Selecting/refining between pre-validated candidates
 *   - Writing explanations
 *   AI call is skipped if: no key present, cache hit, or zero signals
 *
 * Fallback path (zero AI calls):
 *   - Uses highest-priority valid candidate per SKU
 *   - Uses deterministic reason as context
 *   - Fully functional and reproducible
 */

import type { Database } from 'better-sqlite3'
import Anthropic from '@anthropic-ai/sdk'
import type { ProductRow } from '../db'
import type { ActionCard, InsightsResult } from '../insights'
import type { SkuRunContext, AgentSignal, AIBatchResponse, CandidateAction } from './types'
import { buildPercentiles, buildCategoryStats } from './detection'
import { getAllStatesForAgent, recordAgentAction, nextEscalationLevel, isSuppressed } from './state'
import { maybeSnapshot, buildTrendMap } from './snapshots'
import { buildOutcomeMap, persistOutcomeScores, getOutcomeEscalationAdjustment } from './outcomes'
import { buildConflictMap, buildStrategicOpportunities } from './coordinator'
import { rankAndDeduplicate } from './prioritizer'

import * as MarkdownAgent   from './markdown-agent'
import * as PricingAgent    from './pricing-agent'
import * as AssortmentAgent from './assortment-agent'
import * as RiskAgent       from './risk-agent'

const AGENT_REGISTRY = [
  { name: MarkdownAgent.AGENT_NAME,   detect: MarkdownAgent.detect },
  { name: PricingAgent.AGENT_NAME,    detect: PricingAgent.detect },
  { name: AssortmentAgent.AGENT_NAME, detect: AssortmentAgent.detect },
  { name: RiskAgent.AGENT_NAME,       detect: RiskAgent.detect },
]

const AI_CACHE_TTL_MS = 30 * 60 * 1000  // 30-minute cache on AI responses

// ── AI cache ──────────────────────────────────────────────────────────────────

function getCachedAIResponse(db: Database, cacheKey: string): AIBatchResponse | null {
  const row = db.prepare('SELECT response_json, created_at FROM ai_response_cache WHERE cache_key = ?').get(cacheKey) as
    { response_json: string; created_at: string } | undefined
  if (!row) return null
  const age = Date.now() - new Date(row.created_at).getTime()
  if (age > AI_CACHE_TTL_MS) return null
  try { return JSON.parse(row.response_json) as AIBatchResponse } catch { return null }
}

function saveCachedAIResponse(db: Database, cacheKey: string, response: AIBatchResponse): void {
  db.prepare(`
    INSERT OR REPLACE INTO ai_response_cache (cache_key, response_json, created_at)
    VALUES (?, ?, ?)
  `).run(cacheKey, JSON.stringify(response), new Date().toISOString())
}

function buildCacheKey(agentContexts: Record<string, SkuRunContext[]>): string {
  const parts: string[] = []
  for (const [agent, ctxs] of Object.entries(agentContexts).sort()) {
    const skuParts = ctxs
      .map((c) => `${c.product.sku_id}:${c.issue.urgencyScore}:${c.escalationLevel}`)
      .sort()
      .join(',')
    parts.push(`${agent}|${skuParts}`)
  }
  return parts.join('||')
}

// ── Single batched AI call ────────────────────────────────────────────────────

async function batchedAISelection(
  agentContexts: Record<string, SkuRunContext[]>
): Promise<AIBatchResponse | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

  const totalSkus = Object.values(agentContexts).reduce((s, ctxs) => s + ctxs.length, 0)
  if (totalSkus === 0) return null

  const client = new Anthropic()

  const agentSections = Object.entries(agentContexts)
    .filter(([, ctxs]) => ctxs.length > 0)
    .map(([agentName, ctxs]) => {
      const skuBlocks = ctxs.map((ctx) => {
        const candidateList = ctx.validCandidates
          .map((c, i) => `    ${i}: ${c.label} [${c.estimatedImpact}]${c.refinementField ? ` (refine ${c.refinementField} in [${c.refinementMin}–${c.refinementMax}])` : ''}`)
          .join('\n')

        const trendNote = ctx.issue.trend?.has_trend_data
          ? `trend: ST velocity ${ctx.issue.trend.sell_through_velocity > 0 ? '+' : ''}${ctx.issue.trend.sell_through_velocity.toFixed(2)}pts/day, accel ${ctx.issue.trend.sell_through_acceleration > 0 ? '+' : ''}${ctx.issue.trend.sell_through_acceleration.toFixed(3)}, proj30d=${ctx.issue.trend.projected_sell_through_30d.toFixed(0)}%${ctx.issue.trend.early_warning ? ' ⚠early-warning' : ''}`
          : 'trend: no data'

        const outcomeNote = ctx.issue.outcomeRecord?.is_mature
          ? `prior outcome: score ${ctx.issue.outcomeRecord.outcome_score} (eff ${ctx.issue.outcomeRecord.action_efficiency.toFixed(1)}, ST delta ${ctx.issue.outcomeRecord.sell_through_delta > 0 ? '+' : ''}${ctx.issue.outcomeRecord.sell_through_delta}pts)`
          : 'prior outcome: none'

        return `  ${ctx.product.sku_id} (${ctx.product.category}, $${ctx.product.retail_price.toFixed(2)}):
    issue: ${ctx.issue.reason}
    ${trendNote} | ${outcomeNote} | escalation_level: ${ctx.escalationLevel}
    candidates:
${candidateList}`
      }).join('\n')

      return `=== ${agentName} (${ctxs.length} SKU${ctxs.length > 1 ? 's' : ''}) ===\n${skuBlocks}`
    }).join('\n\n')

  const prompt = `You are a merchandising decision optimizer. Detection and constraints have already run — you are ONLY refining final selections.

For each SKU, select the best candidate (by index) and optionally refine the numeric value within the stated bounds.
You cannot suggest new actions, bypass constraints, or exceed candidate bounds.
Consider acceleration (2nd derivative) and 30-day projections when available — prefer proactive actions for deteriorating trajectories.

${agentSections}

Respond with ONLY valid JSON:
{
  "agents": {
    "[agent name]": {
      "selections": {
        "[sku_id]": {
          "candidateIndex": 0,
          "refinement": { "field": "markdown_pct", "value": 12 },
          "reasoning": "one sentence",
          "confidence": 0.85
        }
      },
      "groupTitle": "max 10 words",
      "groupExplanation": "1–2 sentences"
    }
  }
}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as AIBatchResponse
  } catch (err) {
    console.error('[runner] AI batch call failed:', err)
    return null
  }
}

// ── Apply AI refinement to a candidate (stays within bounds, re-validates) ────

function applyRefinement(
  candidate: CandidateAction,
  refinement: { field: string; value: number } | undefined
): CandidateAction {
  if (!refinement || !candidate.refinementField) return candidate
  if (refinement.field !== candidate.refinementField) return candidate

  const min = candidate.refinementMin ?? refinement.value
  const max = candidate.refinementMax ?? refinement.value
  const clampedValue = Math.max(min, Math.min(max, refinement.value))
  if (clampedValue === (candidate.refinementMin ?? clampedValue)) return candidate

  const refinedMutations = candidate.mutations.map((m) => {
    if (m.field === 'markdown_pct' && refinement.field === 'markdown_pct') {
      return { ...m, value: clampedValue }
    }
    if (m.field === 'retail_price' && refinement.field === 'price_multiplier') {
      return { ...m, value: clampedValue }
    }
    if (m.field === 'retail_price' && refinement.field === 'markdown_pct') {
      return { ...m, value: 1 - clampedValue / 100 }
    }
    return m
  })

  return {
    ...candidate,
    label: `${candidate.label} (refined to ${clampedValue.toFixed(1)})`,
    mutations: refinedMutations,
  }
}

// ── Build AgentSignal from contexts + AI response ─────────────────────────────

function buildSignal(
  agentName: string,
  contexts: SkuRunContext[],
  aiAgentResponse: AIBatchResponse['agents'][string] | null,
  runId: string
): AgentSignal {
  const selections = contexts.map((ctx) => {
    const ai = aiAgentResponse?.selections?.[ctx.product.sku_id]
    const rawIdx = ai?.candidateIndex ?? 0
    const idx = Math.min(rawIdx, ctx.validCandidates.length - 1)
    const baseCandidate = ctx.validCandidates[idx]
    const refined = applyRefinement(baseCandidate, ai?.refinement)

    return {
      ctx,
      selected: refined,
      reasoning: ai?.reasoning ?? '',
      confidence: ai?.confidence ?? 0.5,
    }
  })

  const allMutations = selections.flatMap((s) => s.selected.mutations)
  const affectedSkus = selections.map((s) => s.ctx.product.sku_id)
  const maxUrgency = Math.max(...contexts.map((c) => c.issue.urgencyScore))
  const leadCtx = contexts.find((c) => c.issue.urgencyScore === maxUrgency)!

  const title = aiAgentResponse?.groupTitle
    ?? `${agentName}: ${contexts.length} SKU${contexts.length > 1 ? 's' : ''} flagged`

  const aiExplanation = aiAgentResponse?.groupExplanation ?? ''
  const reason = contexts.map((c) => `${c.product.sku_id}: ${c.issue.reason}`).join(' | ')

  const totalInvValue = contexts.reduce((s, c) => s + c.product.inventory_value, 0)
  const impact = `${contexts.length} SKU${contexts.length > 1 ? 's' : ''} · $${totalInvValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} at stake · escalation L${Math.max(...contexts.map((c) => c.escalationLevel))}`

  const dataSummary = selections
    .map((s) => `${s.ctx.product.sku_id}: ${s.ctx.issue.reason} → ${s.selected.label}`)
    .join('\n')

  const avgConfidence = selections.reduce((s, sel) => s + sel.confidence, 0) / selections.length
  const confidence: 'high' | 'medium' | 'low' = avgConfidence >= 0.75 ? 'high' : avgConfidence >= 0.5 ? 'medium' : 'low'

  return {
    id: `${agentName.toLowerCase().replace(/ /g, '-')}-${runId}`,
    agentName,
    severity: leadCtx.issue.severity,
    title,
    impact,
    reason,
    aiExplanation,
    metrics: { ...leadCtx.issue.metrics, urgencyScore: leadCtx.issue.urgencyScore },
    selectedAction: selections[0].selected,
    candidates: leadCtx.validCandidates,
    affectedSkus,
    mutations: allMutations,
    confidence,
    escalationLevel: Math.max(...contexts.map((c) => c.escalationLevel)),
    dataSummary,
    globalPriorityScore: 0,
  }
}

function toActionCard(signal: AgentSignal): ActionCard {
  return {
    id: signal.id,
    severity: signal.severity,
    title: signal.title,
    impact: signal.impact,
    context: signal.aiExplanation || signal.reason,
    dataSummary: signal.dataSummary,
    mutations: signal.mutations,
    affectedSkus: signal.affectedSkus,
    agentSource: signal.agentName,
    reason: signal.reason,
    candidates: signal.candidates,
    escalationLevel: signal.escalationLevel,
    confidence: signal.confidence,
    metrics: signal.metrics,
  }
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runAllAgents(db: Database): Promise<InsightsResult> {
  const products = db.prepare('SELECT * FROM live_products').all() as ProductRow[]
  const logs = db.prepare("SELECT * FROM action_log ORDER BY approved_at DESC").all() as any[]

  if (!products.length) {
    return { cards: [], datasetSummary: 'No product data loaded.', actionLogSummary: '' }
  }

  const dp = buildPercentiles(products)
  const categoryStats = buildCategoryStats(products)
  const runId = Date.now().toString(36)

  // 1. Take snapshot (rate-limited to once/hour internally)
  maybeSnapshot(db, products)

  // 2. Build shared context maps
  const trendMap = buildTrendMap(db, products)
  const outcomeMap = buildOutcomeMap(db, products)
  const conflictMap = buildConflictMap(db)
  const strategicOpportunities = buildStrategicOpportunities(db, conflictMap)

  // 3. Run each agent's deterministic detection
  const agentContexts: Record<string, SkuRunContext[]> = {}
  for (const agent of AGENT_REGISTRY) {
    const stateMap = getAllStatesForAgent(db, agent.name)
    const contexts = agent.detect({
      products,
      dp,
      stateMap,
      trendMap,
      outcomeMap,
      conflictMap,
      categoryStats,
      strategicOpportunities,
    })
    if (contexts.length > 0) agentContexts[agent.name] = contexts
  }

  // 4. Single batched AI call (or cache hit)
  let batchResponse: AIBatchResponse | null = null
  const totalContexts = Object.values(agentContexts).reduce((s, c) => s + c.length, 0)
  if (totalContexts > 0) {
    const cacheKey = buildCacheKey(agentContexts)
    batchResponse = getCachedAIResponse(db, cacheKey)

    if (!batchResponse) {
      batchResponse = await batchedAISelection(agentContexts)
      if (batchResponse) saveCachedAIResponse(db, cacheKey, batchResponse)
    }
  }

  // 5. Build signals from contexts + AI response
  const allSignals: AgentSignal[] = []
  for (const [agentName, contexts] of Object.entries(agentContexts)) {
    for (let i = 0; i < contexts.length; i += 5) {
      const group = contexts.slice(i, i + 5)
      const aiAgent = batchResponse?.agents?.[agentName] ?? null
      const signal = buildSignal(agentName, group, aiAgent, `${runId}-${i}`)
      allSignals.push(signal)
    }
  }

  // 6. Rank, deduplicate globally
  const ranked = rankAndDeduplicate(allSignals, dp.totalInventoryValue, 20)

  // 7. Update agent state (deterministic — after signals are final)
  for (const [agentName, contexts] of Object.entries(agentContexts)) {
    const stateMap = getAllStatesForAgent(db, agentName)
    const aiAgent = batchResponse?.agents?.[agentName]
    for (const ctx of contexts) {
      // Skip suppressed SKUs — they were already filtered in detect(), but guard here too
      const state = stateMap.get(ctx.product.sku_id) ?? null
      if (isSuppressed(state)) continue

      const ai = aiAgent?.selections?.[ctx.product.sku_id]
      const rawIdx = ai?.candidateIndex ?? 0
      const idx = Math.min(rawIdx, ctx.validCandidates.length - 1)
      const selected = ctx.validCandidates[idx]

      const outcome = outcomeMap.get(ctx.product.sku_id) ?? null
      const outcomeAdj = getOutcomeEscalationAdjustment(outcome)

      const newLevel = nextEscalationLevel(ctx.escalationLevel, outcomeAdj.escalationAdjust)
      recordAgentAction(db, agentName, ctx.product.sku_id, selected.type, selected.priority, newLevel)
    }
    persistOutcomeScores(db, agentName, outcomeMap)
  }

  // 8. Build response
  const cards = ranked.map(toActionCard)

  const cats = [...new Set(products.map((p) => p.category))]
  const earlyWarnings = [...trendMap.values()].filter((t) => t.early_warning).length
  const datasetSummary = [
    `${products.length} SKUs · ${cats.length} categories (${cats.join(', ')}).`,
    `ST: p25=${dp.sellThrough.p25.toFixed(0)}%, p50=${dp.sellThrough.p50.toFixed(0)}%, p75=${dp.sellThrough.p75.toFixed(0)}%.`,
    `WoS: p25=${dp.weeksOfSupply.p25.toFixed(1)}, p50=${dp.weeksOfSupply.p50.toFixed(1)}, p90=${dp.weeksOfSupply.p90.toFixed(1)}.`,
    `Total inv value: $${dp.totalInventoryValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}.`,
    earlyWarnings > 0 ? `Early warnings: ${earlyWarnings} SKU${earlyWarnings > 1 ? 's' : ''} trending toward threshold.` : '',
    batchResponse ? `AI: 1 batched call · ${totalContexts} SKUs optimised.` : 'AI: offline — deterministic fallback.',
  ].filter(Boolean).join(' ')

  const approved = logs.filter((l) => l.status === 'approved')
  const actionLogSummary = approved.length === 0
    ? 'No actions approved yet.'
    : approved.slice(0, 5).map((l) => `${l.agent_source}: ${l.title}`).join(' | ')

  return { cards, datasetSummary, actionLogSummary }
}
