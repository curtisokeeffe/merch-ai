# MerchAI — Project Summary
_Last updated: 2026-04-13. Use this doc to resume context after usage limits._

---

## What this is
A Next.js 14 (App Router) retail merchandising AI dashboard. Uses Claude (Anthropic SDK) for AI features and SQLite (`better-sqlite3`) for a live product database. No auth — demo user hardcoded. Runs locally on `npm run dev`.

---

## Stack
- Next.js 14.2.21 · TypeScript · Tailwind (mostly unused — inline styles throughout)
- `@anthropic-ai/sdk` for Claude API calls
- `better-sqlite3` for SQLite
- DM Sans + JetBrains Mono fonts (Google Fonts via layout.tsx)
- Model: `claude-sonnet-4-5` (updated from old `claude-sonnet-4-20250514`)

---

## File structure

```
app/
  layout.tsx              Root layout — wraps all pages in <Nav />
  globals.css             Light theme. .dashboard-shell = fixed-height, .page-shell = scrollable
  page.tsx                Dashboard — KPIs, top 3 signals, agent overview, right-side AI chat
  components/
    Nav.tsx               Fixed top nav (56px). Logo + links + Menu dropdown + User dropdown
  agents/
    page.tsx              Agents hub — sidebar agent list, signals grid, configure chat, query chat
  changes/
    page.tsx              Change history — timeline, impact stats, mutation details, redeploy btn
  data/
    page.tsx              Data page — Overview (KPIs + category bars), Database table, Simulate chat
  profile/
    page.tsx              User profile — account info, notification toggles, agent defaults, API status
  api/
    kpis/route.ts         GET — returns 5 KPIs from live_products
    insights/route.ts     GET — returns 8 ActionCards computed from heuristics
    ask/route.ts          POST {messages} — multi-turn chat with full product data in system prompt
    explain/route.ts      POST {context, dataSummary} — streams 3-4 sentence explanation
    card-chat/route.ts    POST {card, messages, agentConfig} — per-card conversation stream
    agent-config/route.ts POST {agentName, messages, currentConfig} — agent configuration stream
    db-peek/route.ts      GET — returns live_products rows + changedSkus array
    changes/route.ts      GET — returns action_log entries as ChangeEntry[]
    actions/
      approve/route.ts    POST {card} — applies mutations, logs, returns updated KPIs
      dismiss/route.ts    POST {card} — logs dismissal
    reset/route.ts        POST — resets live_products from base_products, clears action_log

lib/
  db.ts                   SQLite init, seed from CSV, getDb() export
  insights.ts             computeInsights() — 8 hardcoded heuristic ActionCards
  kpis.ts                 computeKPIs() — 5 KPI calculations
  kpis.ts                 (data.ts is legacy, unused)

data/
  demo.db                 SQLite database (gitignored)
```

---

## Key design decisions
- **Inline styles throughout** — no Tailwind classes used in practice (config present but not leveraged)
- **Light theme** — white cards, #F8FAFC background, amber (#F59E0B) accent
- **Fixed nav** — 56px tall, `position: fixed`. All pages add `paddingTop: 56`
- **Dashboard** uses `.dashboard-shell` class (height: calc(100vh - 56px), overflow: hidden)
- **agentConfigs** persisted to `localStorage` under key `agentConfigs` (JSON object: agentName → instruction string). Written by agents/page.tsx, read by card-chat API calls.

---

## Agent system
4 named agents (labels only — not autonomous):
- **Markdown Agent** — color #EF4444, slow-movers & excess inventory signals
- **Pricing Agent** — color #F59E0B, margin recovery & price tier signals
- **Assortment Agent** — color #22C55E, bundling & fast-mover signals
- **Risk Agent** — color #8B5CF6, concentration risk signals

Each agent produces 2 ActionCards from `lib/insights.ts`. Cards have: id, severity (red/amber/green), title, impact, context, dataSummary, mutations[], affectedSkus[], agentSource.

---

## API patterns
All streaming routes use this pattern (fixed after overloaded_error crash bug):
```typescript
const readable = new ReadableStream({
  async start(controller) {
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta')
          controller.enqueue(encoder.encode(event.delta.text))
      }
    } catch (err) {
      console.error('[route-name] stream error:', err)
      controller.enqueue(encoder.encode('\n\n[Error: ' + String(err) + ']'))
    } finally {
      controller.close()
    }
  }
})
```

---

## Current branch / git state
- Main branch: `master`
- Working branch: `feature/clean-restore`
- PR open: curtisokeeffe/merch-ai#3
- `.env.local` has ANTHROPIC_API_KEY (gitignored, never committed)

---

## Known issues / recent fixes
- `claude-sonnet-4-20250514` → changed to `claude-sonnet-4-5` (old model ID caused failures)
- Stream errors now caught and shown inline instead of crashing with "Failed to fetch"
- `overflow: hidden` on body removed to support multi-page scrolling

---

## What was just built (multi-page refactor)
1. `Nav.tsx` — top navigation with Menu dropdown + User dropdown
2. `page.tsx` — simplified dashboard with right-side chat panel
3. `agents/page.tsx` — full agents hub: agent selector sidebar, signals, configure chat, query chat
4. `changes/page.tsx` — timeline view with impact metrics and redeploy button
5. `data/page.tsx` — Overview + Database (sortable, searchable) + Simulate chat
6. `profile/page.tsx` — user card, stats, notification toggles, agent defaults, API status

---

## To resume work
1. Check out `feature/clean-restore` in `C:\Users\cokeeffe1\merch-ai`
2. `npm run dev` from that directory (node_modules may be in the worktree at `.claude/worktrees/laughing-chatelet/`)
3. App runs on port 3001 (3000 may be in use)
4. Read this file, then read the specific page file you want to edit

## Next likely tasks
- Commit and push the multi-page refactor to the open PR
- Real agent autonomy (background jobs, not just heuristics)
- Charts/visualizations on Data > Overview
- Redeploy button wired to actual re-apply logic
- Auth layer (if moving beyond demo)
