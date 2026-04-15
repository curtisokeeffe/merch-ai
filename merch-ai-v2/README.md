# MerchAI v2 Platform

A new branch of the MerchAI merchandising intelligence platform, built as a parallel version of the original app. The original app (`merch-ai/`) is fully preserved and untouched.

---

## What this is

MerchAI v2 repositions the product around five AI-agent-driven modules designed for mid-market fashion/apparel retailers using Shopify, NetSuite, Lightspeed, and Google Sheets. The v1 signal-and-approve pattern is expanded into a full decision-support platform.

**Five core modules:**
1. **Daily Signals** — Automated performance reporting, anomaly detection, and AI-generated daily briefs
2. **Product Content** — Vision + LLM-driven title, description, SEO metadata, and tag generation
3. **Dynamic Pricing** — Elasticity-based pricing recommendations with per-SKU guardrails and approval workflow
4. **Demand & Replenishment** — SKU-level demand forecasting, PO recommendations, and size-curve allocation
5. **Markdowns & Promos** — Urgency-driven markdown timing and scenario simulation with Claude

---

## How to run

### Prerequisites
- Node.js 18+
- `ANTHROPIC_API_KEY` set in `.env.local`

### Steps

```bash
# From repo root
cd merch-ai-v2

# Install dependencies
npm install

# Copy env template
cp .env.local.example .env.local
# Edit .env.local and add your ANTHROPIC_API_KEY

# Start dev server (port 3002)
npm run dev
```

Open: http://localhost:3002

The SQLite database is created automatically at `data/v2.db` on first run and seeded with 13 realistic fashion/apparel SKUs plus mock signals, forecasts, and recommendations.

---

## Running both versions simultaneously

| Version | Directory | Port | Database |
|---------|-----------|------|----------|
| v1 (original) | `merch-ai/` | 3001 | `merch-ai/data/demo.db` |
| v2 (this branch) | `merch-ai-v2/` | 3002 | `merch-ai-v2/data/v2.db` |

Both can run at the same time. They share no database, routes, or runtime state.

```bash
# Terminal 1 — v1
cd merch-ai && npm run dev   # → http://localhost:3001

# Terminal 2 — v2
cd merch-ai-v2 && npm run dev  # → http://localhost:3002
```

---

## What is real vs mocked

### Real (functional with `ANTHROPIC_API_KEY`)
- `POST /api/performance/run` — Claude generates a daily brief from live signals
- `POST /api/content/generate` — Claude generates product titles, descriptions, SEO, tags, and collection suggestions for each SKU
- `POST /api/promotions/simulate` — Claude runs a scenario simulation and projects revenue, units, and margin

### Mocked (seed data, no external credentials needed)
- All 13 product SKUs and catalog data
- Performance signals (7 realistic anomalies and alerts)
- Pricing recommendations with elasticity reasoning
- Demand forecasts (Q2 2026 projections)
- Replenishment orders with supplier/MOQ data
- Markdown recommendations with urgency scores
- Initial promotion scenario examples
- Integration connection status (Shopify, NetSuite, Google Sheets shown as "connected" — no real API calls made)
- Daily brief (one seeded example; regeneration via Claude is real)

### Integrations
All four platform integrations (Shopify, NetSuite, Lightspeed, Google Sheets) are **UI-only mocks**. The settings page shows connection status and credential inputs, but no actual API calls are made to external platforms.

To wire real integrations:
- Shopify: use `@shopify/shopify-api` with Admin API
- NetSuite: SuiteScript REST API
- Lightspeed: Lightspeed Retail API
- Google Sheets: `googleapis` npm package

---

## What is reused from v1

| Component | Reused? | Notes |
|-----------|---------|-------|
| `better-sqlite3` setup pattern | Adapted | Same `getDb()` singleton pattern, new schema |
| `@anthropic-ai/sdk` usage | Adapted | Same model (`claude-sonnet-4-5`), new prompts |
| Inline styles design pattern | Yes | Same approach, new design tokens (navy sidebar, indigo accent) |
| DM Sans + JetBrains Mono fonts | Yes | Same Google Fonts setup |
| Streaming API pattern | Not used | v2 uses batch calls for simplicity |

All business logic, DB schema, insights computation, and API routes are newly built.

---

## Architecture notes

```
merch-ai-v2/
├── lib/
│   ├── db.ts          Schema + seed (all tables, 13 SKUs, mock data)
│   ├── types.ts       Shared TypeScript interfaces
│   └── claude.ts      Anthropic client wrapper
├── app/
│   ├── layout.tsx     Root layout with fixed dark sidebar
│   ├── page.tsx       Command Center dashboard (action queue + brief)
│   ├── performance/   Daily Signals module
│   ├── content/       Product Content module
│   ├── pricing/       Dynamic Pricing module
│   ├── forecasting/   Demand & Replenishment module
│   ├── promotions/    Markdowns & Promos module
│   ├── settings/      Integrations, agent config, guardrails
│   └── api/           All backend routes (14 route files)
```

---

## Production hardening checklist

Before shipping this beyond demo:

- [ ] Add authentication (NextAuth.js, Clerk, or custom JWT)
- [ ] Move `ANTHROPIC_API_KEY` and integration credentials to a secrets manager
- [ ] Replace `CONNECTIONS_WRITE_TOKEN` mock auth with real session-based auth
- [ ] Wire real Shopify/NetSuite/Lightspeed API clients
- [ ] Replace heuristic forecasting with a statistical model (e.g., exponential smoothing, Prophet)
- [ ] Add proper elasticity modeling (price elasticity curves by category)
- [ ] Add size-curve data model and per-category curve configuration
- [ ] Rate-limit and queue Claude API calls (currently fire-and-forget)
- [ ] Add background job runner for periodic signal analysis (e.g., BullMQ, cron)
- [ ] Add proper error boundaries and loading states throughout
- [ ] Set up monitoring/alerting for agent recommendations before auto-approving anything

---

## Branch and isolation

- **Branch**: `worktree-agent-ae635c08` (rename to `feature/v2-platform` when merging)
- **v1 untouched**: The `merch-ai/` directory was not modified. All changes are in `merch-ai-v2/`
- **No shared state**: Separate SQLite databases, separate ports, separate Next.js instances
