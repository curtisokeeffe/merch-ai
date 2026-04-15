/**
 * Global Signal Prioritizer
 *
 * Ranks signals across ALL agents by composite score:
 *   urgency (40%) + inventory at stake (35%) + escalation level (15%) + trend (10%)
 *
 * Ensures the most important actions surface first, reducing noise.
 * Also applies a global de-duplication pass to prevent the same SKU
 * appearing in multiple signals (keeps it in the highest-priority one).
 */

import type { AgentSignal } from './types'

const W_URGENCY = 0.40
const W_INVENTORY = 0.35
const W_ESCALATION = 0.15
const W_TREND = 0.10

// ── Scoring ───────────────────────────────────────────────────────────────────

export function computePriorityScore(
  signal: AgentSignal,
  totalInventoryValue: number
): number {
  // Urgency: 0–100 from the lead issue
  const urgencyComponent = signal.metrics.urgencyScore as number ?? 50

  // Inventory at stake: % of total portfolio
  const ivAtStake = totalInventoryValue > 0
    ? ((signal.metrics.inventoryValue as number ?? 0) / totalInventoryValue) * 100
    : 0
  const inventoryComponent = Math.min(100, ivAtStake * 5)  // scale: 20% share = 100

  // Escalation: higher escalation = this issue has persisted = more urgent
  const escalationComponent = Math.min(100, (signal.escalationLevel ?? 0) * 33)

  // Trend modifier (injected into urgencyScore during detection — just amplify here)
  const trendComponent = urgencyComponent > 70 ? 100 : 0

  const score =
    urgencyComponent * W_URGENCY +
    inventoryComponent * W_INVENTORY +
    escalationComponent * W_ESCALATION +
    trendComponent * W_TREND

  return Math.round(score * 10) / 10
}

// ── Rank and deduplicate ──────────────────────────────────────────────────────

export function rankAndDeduplicate(
  signals: AgentSignal[],
  totalInventoryValue: number,
  maxSignals = 20
): AgentSignal[] {
  // Score each signal
  const scored = signals.map((s) => ({
    ...s,
    globalPriorityScore: computePriorityScore(s, totalInventoryValue),
  }))

  // Sort by score descending
  scored.sort((a, b) => b.globalPriorityScore - a.globalPriorityScore)

  // De-duplicate: each SKU appears in at most one signal
  const seenSkus = new Set<string>()
  const deduplicated: typeof scored = []

  for (const signal of scored) {
    const newSkus = signal.affectedSkus.filter((id) => !seenSkus.has(id))
    if (newSkus.length === 0) continue  // all SKUs already covered by a higher-priority signal

    // Keep signal but limit to SKUs not already claimed
    const prunedMutations = signal.mutations.filter((m) => newSkus.includes(m.sku_id))
    deduplicated.push({
      ...signal,
      affectedSkus: newSkus,
      mutations: prunedMutations,
    })

    for (const id of newSkus) seenSkus.add(id)
    if (deduplicated.length >= maxSignals) break
  }

  return deduplicated
}
