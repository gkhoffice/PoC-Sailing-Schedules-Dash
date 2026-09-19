# MSC Sailing Schedules

A responsive dashboard that retrieves and filters MSC vessel sailing schedules departing Port Louis, Mauritius.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the Express API server
- `pnpm --filter @workspace/msc-schedules run dev` — run the Vite dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/msc-schedules run build` — build the frontend with workflow-provided `PORT` and `BASE_PATH`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`)
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Browser automation: Playwright with the Replit Chromium binary

## Where things live

- `artifacts/msc-schedules/src/pages/dashboard.tsx` — schedule dashboard and filter interactions
- `artifacts/api-server/src/routes/schedules.ts` — cache, summary, and refresh endpoints
- `artifacts/api-server/src/lib/msc-scraper.ts` — Playwright interaction and JSON/XHR normalization
- `artifacts/api-server/src/lib/schedule-store.ts` — local JSON cache read/write helpers
- `lib/api-spec/openapi.yaml` — source of truth for API contracts
- `data/msc-schedules.json` — MVP schedule cache

## Architecture decisions

- Schedule reads never launch a browser; only the explicit refresh endpoint runs Playwright.
- The JSON cache is replaced only after a successful MSC capture, so a failed refresh cannot erase the last good result.
- The scraper prefers captured JSON responses and only uses the rendered page to select Port Louis and submit the search.
- The API uses the system Chromium path available in Replit, with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` available as an override.

## Product

- View normalized MSC sailings from Port Louis, Mauritius, with destination, vessel, voyage, ETD, ETA, transit time, and service where available.
- Search by destination and departure date window.
- See cache freshness, summary metrics, loading/error/empty states, and manually refresh the carrier data.

## User preferences

- Keep the MVP lean, unauthenticated, database-free, and backed by a local JSON cache.

## Gotchas

- MSC may return an access-denied page to automated browsers; the refresh endpoint reports that failure and leaves the existing cache untouched.
- Frontend builds require workflow-provided `PORT` and `BASE_PATH` values.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
