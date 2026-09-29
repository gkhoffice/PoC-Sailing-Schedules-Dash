# Project Prompts and Change Review

This is the consolidated project record for the MSC Sailing Schedules app. It
includes the project requests available in the current conversation context and
a review of the resulting code changes and verification.

Some earlier messages were compacted before this record was created. Those
earlier requests are reconstructed from the retained conversation summary and
are marked as summaries, not verbatim quotes. This document covers project
requests and code changes; it does not reproduce internal instructions or
platform-generated notices.

## Project

**MSC Sailing Schedules** — a web app for finding MSC and Maersk sailings from
Port Louis, Mauritius, and viewing the departure manifest.

## Main prompt

The opening project prompt is not available verbatim in the retained
conversation. Reconstructed from the preserved project context, the main prompt
was:

> Update the existing MSC + Maersk sailing schedules app. Keep schedule search
> on the main page, use Search for the search action, move the Departure
> Manifest table to its own page, align the search controls horizontally, add
> PDF, CSV, and XLSX exports to the manifest, and fix the published app so it
> reads the populated schedule cache.

This is a consolidated reconstruction of the overall project request, not a
claim that these were the exact original words.

## Prompt archive

### Earlier requests reconstructed from compacted history

1. Keep schedule search on the main page, use **Search** instead of **Filter**,
   and put the Departure Manifest table on a separate page.
2. “align all boxes in the search form on the same horizontal level.”

### Exact user prompts available in the current context

> please add option to export to PDF, CSV and XLSX. Add it to the Departure manifest section

> I have published the app, but it shows no data...

> please consolidate all prompt and chat and save it to workspace.

> ok please export all prompts to workpace

> Please compile and consolidate all my prompts and the review of changes you made.

> Please compile and consolidate all my prompts and the review of changes you made. Include the main prompt.

## Change review

### 1. Search page and separate manifest

**What changed**

- `/` is the main search page; `/manifest` is the departure board.
- The main form searches by destination and departure-date window.
- Search values are carried in the URL so filtered results can be opened or
  reloaded directly.
- The manifest has a **Search** action to show its filter form.

**Review**

- Filters are applied to the schedule request, and direct URL filters were
  checked. A Singapore/date search was previously verified to show only its
  matching row.
- The implementation reads `window.location.search` for manifest filters
  because the Wouter location value did not include the query string in the
  tested flow.

### 2. Search-form alignment

**What changed**

- Desktop grid items are top-aligned, with spacing on the action group to align
  Clear/Search with the date inputs.
- Destination helper text remains below the destination box rather than moving
  the date controls downward.

**Review**

- The desktop layout was inspected in a 1440px-wide preview.
- The frontend typecheck passed after the alignment change.

### 3. PDF, CSV, and XLSX manifest exports

**What changed**

- PDF, CSV, and XLSX buttons were added beside Search in the Departure manifest.
- Exports use the visible, filtered schedule rows.
- The files include destination, carrier, origin, vessel, voyage, departure,
  arrival, transit, service, and booking URL data where applicable.
- PDF includes the active filter summary and paginates; XLSX includes sensible
  column widths; CSV uses quoted/escaped fields and a UTF-8 BOM.
- Missing schedule details are displayed as em dashes in exports.
- Export buttons show progress, disable during generation, and report failures
  with a retry action.
- PDF and XLSX libraries load on demand to keep the initial app bundle smaller.

**Review**

- Browser tests verify non-empty PDF, CSV, and XLSX downloads and check that
  filtered exports omit unrelated destinations.
- Tests also cover missing fields in rows, including readable blank dates and
  transit details.
- The production frontend build and typecheck passed. The build retains an
  existing tooltip sourcemap warning.

### 4. Published app returned no schedule data

**What changed**

- The API cache default was changed from a working-directory-relative location
  to a path resolved relative to the API module/artifact.
- The `SCHEDULE_CACHE_PATH` override remains available.

**Cause found**

- Production was reading the empty root-level placeholder file instead of the
  populated cache bundled under the API artifact.
- The populated bundled cache contained 4,051 sailings.

**Review and verification**

- API typecheck passed and all 13 API tests passed after the fix.
- A production-style local run of the compiled API, started from the repository
  root, returned all 4,051 bundled schedule rows.
- This fixes the cache path in source; the published app must be republished
  before it will serve the corrected build.

**Separate refresh limitation**

- Production logs also showed the manual carrier refresh could not find
  `/repl/tools/bin/chromium`. That is separate from the empty-cache bug. The
  bundled cache should be readable after republishing, but live carrier refresh
  may still fail until the production browser executable configuration is
  addressed.

## Verification summary

- Search and filtered navigation: previously checked in the browser, including
  direct destination/date filtering.
- Search alignment: visually checked at desktop width; typecheck passed.
- Exports: browser download tests cover all three formats, filtered rows, and
  incomplete schedule details.
- API cache correction: typecheck, 13 API tests, and a compiled production-style
  API request passed with 4,051 schedules.
- Frontend production build: passed with lazy-loaded export dependencies.
- No live post-fix production verification is recorded here because the fixed
  version still needs to be published.

## Main workspace files

- `artifacts/msc-schedules/src/App.tsx` — route registration
- `artifacts/msc-schedules/src/pages/search.tsx` — main search page
- `artifacts/msc-schedules/src/pages/dashboard.tsx` — departure manifest,
  filters, and export controls
- `artifacts/msc-schedules/src/lib/export-schedules.ts` — PDF, CSV, and XLSX
  generation
- `artifacts/api-server/src/routes/schedules.ts` — schedule, summary, and
  refresh endpoints
- `artifacts/api-server/src/lib/schedule-store.ts` — schedule-cache path and I/O
- `artifacts/api-server/data/msc-schedules.json` — bundled schedule cache