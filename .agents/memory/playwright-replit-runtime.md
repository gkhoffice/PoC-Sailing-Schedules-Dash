---
name: Playwright browser runtime in Replit
description: Browser executable and native library expectations for Playwright-backed server workflows.
---

Use the Replit-provided `/repl/tools/bin/chromium` executable for server-side Playwright when the bundled Playwright headless shell cannot resolve Nix native libraries. Keep an environment-variable override for portability.

**Why:** The bundled browser may download successfully but fail at launch with missing shared libraries in the managed workflow runtime.

**How to apply:** Prefer the system Chromium path in Playwright launch options and keep refresh failures explicit so cached data is not overwritten.---
name: Playwright browser runtime in Replit
description: Browser executable and native library expectations for Playwright-backed server workflows.
---

Use the Replit-provided `/repl/tools/bin/chromium` executable for server-side Playwright when the bundled Playwright headless shell cannot resolve Nix native libraries. Keep an environment-variable override for portability.

**Why:** The bundled browser may download successfully but fail at launch with missing shared libraries in the managed workflow runtime.

**How to apply:** Prefer the system Chromium path in Playwright launch options and keep refresh failures explicit so cached data is not overwritten.