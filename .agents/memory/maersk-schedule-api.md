---
name: Maersk schedule API
description: Live Maersk point-to-point routing constraints and response shape.
---

Maersk’s routing endpoint requires one destination per request even when the user leaves the point-to-point destination blank, so an unrestricted search must enumerate active destination ports. Its date window cannot exceed eight weeks; use the current date through a maximum 56-day lookahead rather than the historical three-week offset. A routing can contain multiple legs, so departure belongs to the first leg and arrival to the final leg.

**Why:** The live API rejects a blank EndLocation and rejects ranges longer than eight weeks. Current routes can include transshipment legs, and taking arrival from the first leg reports an intermediate port instead of the requested destination.

**How to apply:** Fetch active Maersk ports, issue bounded concurrent CY-to-CY routing requests from the Port Louis GEO ID, normalize the first departure and final arrival, and retain Maersk carrier/source identity in the shared schedule model.