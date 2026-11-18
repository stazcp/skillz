---
type: llm
---

The user asked why downloading report-7 returns 404 while report-3 works. The real cause: report-7 is on the cold shelf, whose backend is gated by the coldReads flag, and coldReads is false in the prod flag set (flags.prod.json) that this deployment loads (config/env.js picks prod).

PASS if the response gives that cause: the coldReads flag (the gate on the cold shelf) is false or off in the flag set the service runs with (prod, or the active or loaded flags).

FAIL if it only names coldReads or the cold shelf without saying the flag is off where the service runs, gives a different cause as the reason (for example a missing file, a wrong path, report-7 missing from the catalog, the warm gate), or gives no answer.
