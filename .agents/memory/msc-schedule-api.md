---
name: MSC schedule API
description: Durable behavior of MSC’s public schedule search endpoint and its destination requirement.
---

MSC’s public schedule UI requires a destination port, but its available-port list and SearchSailingRoutes endpoint can be used to assemble an all-destination result set from Port Louis.

**Why:** A blank destination is rejected by MSC with “You have to choose at least one destination Port,” so submitting the rendered form alone cannot populate an unrestricted dashboard.

**How to apply:** Initialize the page with Playwright and use same-origin JSON requests with the Port Louis ID, each available destination PortId, the current FromDate, English language, and MSC’s configured data-source identifier. Bound concurrency and keep only successful route payloads.