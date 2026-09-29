# Project Prompts and Chat Summary

This file consolidates the available project conversation into a reusable brief.
Some older messages were compacted before this document was created, so the
earlier requirements and decisions below are summarized rather than quoted
verbatim. Recent user requests are quoted where they are available. This record
contains project-facing requests and decisions, not internal system instructions.

## Project

**MSC Sailing Schedules** — a web app for finding MSC and Maersk sailings from
Port Louis, Mauritius, and viewing the departure manifest.

## Consolidated requirements

1. Keep a main-page search form for destination and departure-date filtering.
2. Make the departure manifest a separate page at `/manifest`.
3. Use **Search** for the search/filter action.
4. Align all desktop search-form fields and actions on the same horizontal level.
5. Add PDF, CSV, and XLSX exports to the Departure manifest. Export the rows
   currently shown, including the active destination/date filters.
6. Ensure the published app displays the schedule data, not an empty cache.

## Conversation record

### Search and manifest layout

**User request, summarized from compacted conversation:**  
Keep search on the main page, move the Departure Manifest table to its own page,
and replace the Filter call to action with Search.

**Follow-up request:**  
“align all boxes in the search form on the same horizontal level.”

**Outcome:**  
The main page is `/`; `/manifest` contains the schedule table. Searches carry
destination/date values through URL parameters. The desktop search form uses
top-aligned controls so the destination helper text does not offset the date
inputs and actions. The route/filter flow was previously checked in the browser,
including a filtered Singapore result.

### Manifest exports

**User request:**  
“please add option to export to PDF, CSV and XLSX. Add it to the Departure
manifest section”

**Outcome:**  
PDF, CSV, and XLSX controls were added beside Search in the Departure manifest.
They export the currently shown schedules and include schedule details and
booking URLs. PDF and XLSX dependencies are lazy-loaded to avoid increasing the
initial JavaScript bundle unnecessarily.

**Verification recorded:**  
API/client typechecks and the production frontend build passed. The manifest
export test verifies filtered data and usable PDF, CSV, and XLSX downloads.
Follow-up tasks were merged to cover export downloads, generation errors, and
blank schedule details.

### Published app showed no schedule data

**User request:**  
“I have published the app, but it shows no data...”

**Investigation:**  
The published `/api/schedules` endpoint returned HTTP 200 with an empty result.
The repository contains a populated cache at
`artifacts/api-server/data/msc-schedules.json` (4,051 rows) and an empty
root-level placeholder at `data/msc-schedules.json`. In production, the API was
using the working-directory-relative placeholder. Production logs also showed
that manual refresh could not launch Chromium at `/repl/tools/bin/chromium`;
that is separate from the empty-cache cause and means refreshing live carrier
data may fail in that runtime.

**Fix and verification:**  
The API cache default now resolves relative to the API module/artifact location,
while retaining `SCHEDULE_CACHE_PATH` as an override. Typecheck and all 13 API
tests passed. A compiled production-style server run from the repository root
returned 4,051 schedules from the bundled artifact cache.

**Current status:**  
The source fix is in the workspace. The corrected version must be published
before the live app will use it.

## Key behavior and implementation decisions

- The manifest query string is read from `window.location.search` because the
  Wouter location value did not include it in the tested flow.
- Schedule reads use the local JSON cache; the explicit refresh endpoint runs
  the carrier scrapers.
- Failed refreshes should retain existing cached rows rather than replace them
  with an empty result.
- The bundled API cache must be located from the module/artifact path, not
  `process.cwd()`, because development and production may start from different
  working directories.

## Relevant workspace areas

- `artifacts/msc-schedules/src/pages/search.tsx` — main search page
- `artifacts/msc-schedules/src/pages/dashboard.tsx` — departure manifest,
  filtering, and export controls
- `artifacts/msc-schedules/src/lib/export-schedules.ts` — PDF, CSV, and XLSX
  export generation
- `artifacts/api-server/src/routes/schedules.ts` — schedule, summary, and
  refresh endpoints
- `artifacts/api-server/src/lib/schedule-store.ts` — cache path and cache I/O
- `artifacts/api-server/data/msc-schedules.json` — bundled populated schedule
  cache