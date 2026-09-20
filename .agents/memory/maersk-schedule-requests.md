---
name: Maersk schedule requests
description: Reliable browser-based access pattern for the Maersk schedules API.
---

Use the Maersk schedule page for the browser session, but send the API calls through a separate Playwright API request context. A request context inherited from the page can carry anti-bot cookies and time out on the active-ports request; page-evaluated fetches can also fail because of cross-origin policy.

**Why:** The live Maersk page and API are protected differently from the page shell, so sharing the page context is not reliable.

**How to apply:** Keep the browser navigation temporary, create an independent request context for active-port and routing calls, use the public schedule consumer headers, and dispose the request context after each refresh.