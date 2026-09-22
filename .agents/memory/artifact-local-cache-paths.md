---
name: Artifact-local cache paths
description: Deployment-safe handling for local JSON data bundled with an API artifact
---

Local files that are part of an artifact must be resolved from the artifact or module location, not from `process.cwd()`. Development commands often start inside the package directory, while published artifact services may start from the repository or deployment root; a cwd-relative path can silently select a different empty file.

**Why:** The published API successfully returned HTTP 200 while reading an empty root-level placeholder cache, even though the artifact contained the populated schedule cache.

**How to apply:** Keep an explicit environment-variable override for tests and operations, but make the default path relative to the compiled/source module location so development and published runs select the same bundled data.