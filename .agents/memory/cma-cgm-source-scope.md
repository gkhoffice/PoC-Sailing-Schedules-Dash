---
name: CMA CGM source scope
description: User requirements for the CMA CGM schedule source and independent-environment testing.
---

The user requested CMA CGM schedules from Port Louis, Mauritius, to any destination for five weeks using normal Playwright browsing.

**Why:** The user explicitly asked to build the browser workflow even when the site is inaccessible from Replit, so they can test it in their own environment later.

**How to apply:** Keep the ordinary browser workflow testable independently of the other carriers. Do not replace it with a mandatory portal API key. Distinguish fixture verification from live site verification and do not claim the site's actual form supports a blank destination until observed.
