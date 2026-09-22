---
name: PDF fallback encoding
description: How raw browser tests should verify em-dash fallback values in jsPDF exports.
---

jsPDF exports that use standard Helvetica fonts encode the em-dash fallback as the WinAnsi byte `0x97`, not as a UTF-8 em-dash sequence.

**Why:** Browser export tests inspect downloaded PDF bytes directly, so a UTF-8 string assertion can fail even though the rendered PDF remains readable.

**How to apply:** Decode raw PDF downloads as Latin-1 and assert the WinAnsi marker when verifying dash fallbacks; keep CSV and XLSX assertions on their Unicode values.