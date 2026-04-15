import type { Database } from 'better-sqlite3'
import type { AgentStateRow } from './types'

// ── Read ──────────────────────────────────────────────────────────────────────

export function getSkuState(
  db: Database,
  agentName: string,
  skuId: string
): AgentStateRow | null {
  const row = db
    .prepare('SELECT * FROM agent_state WHERE agent_name = ? AND sku_id = ?')
    .get(agentName, skuId) as AgentStateRow | undefined
  return row ?? null
}

export function getAllStatesForAgent(
  db: Database,
  agentName: string
): Map<string, AgentStateRow> {
  const rows = db
    .prepare('SELECT *, COALESCE(outcome_score, 0) as outcome_score FROM agent_state WHERE agent_name = ?')
    .all(agentName) as AgentStateRow[]
  const map = new Map<string, AgentStateRow>()
  for (const row of rows) map.set(row.sku_id, row)
  return map
}

// ── Suppression check ─────────────────────────────────────────────────────────
// Returns true if this SKU is currently in a suppression window (outcome-driven).

export function isSuppressed(state: AgentStateRow | null): boolean {
  if (!state?.suppress_until) return false
  return new Date(state.suppress_until).getTime() > Date.now()
}

// ── Write ─────────────────────────────────────────────────────────────────────

export function recordAgentAction(
  db: Database,
  agentName: string,
  skuId: string,
  actionType: string,
  actionValue: number,
  newEscalationLevel: number
): void {
  const existing = getSkuState(db, agentName, skuId)
  const runCount = (existing?.run_count ?? 0) + 1

  db.prepare(`
    INSERT INTO agent_state
      (agent_name, sku_id, last_action_type, last_action_value, last_run_at, run_count, escalation_level)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (agent_name, sku_id) DO UPDATE SET
      last_action_type  = excluded.last_action_type,
      last_action_value = excluded.last_action_value,
      last_run_at       = excluded.last_run_at,
      run_count         = excluded.run_count,
      escalation_level  = excluded.escalation_level
  `).run(agentName, skuId, actionType, actionValue, new Date().toISOString(), runCount, newEscalationLevel)
}

// ── Escalation logic ──────────────────────────────────────────────────────────
// Each time a SKU is still flagged after a prior action, it escalates.
// The escalation level is capped at MAX_ESCALATION_LEVEL.
// Outcome feedback can reduce the escalation level (graduated, not full reset).

export const MAX_ESCALATION_LEVEL = 3

export function nextEscalationLevel(current: number, outcomeAdjust: number = 0): number {
  const adjusted = current + outcomeAdjust
  const afterEscalation = adjusted + 1  // normal escalation increment
  return Math.max(0, Math.min(MAX_ESCALATION_LEVEL, afterEscalation))
}
