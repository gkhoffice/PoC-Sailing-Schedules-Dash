---
name: Wouter query state
description: Query-string synchronization behavior for Wouter-routed pages in this app
---

When a Wouter route changes, `useLocation()` provides the route pathname but may not include the current query string. Read `window.location.search` when hydrating or synchronizing state that is encoded in URL parameters.

**Why:** Search parameters used for manifest navigation were initially lost because state synchronization read only the Wouter location value.

**How to apply:** Keep pathname routing and query-state parsing separate; use the browser URL for query values and test direct navigation plus in-app navigation.