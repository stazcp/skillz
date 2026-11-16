---
type: llm
focus: trace
---

Look only at the first Agent tool call in the trace: its input parameters and its `prompt` (the brief).

PASS if that call carries effort `max`: either an `effort` parameter set to `max`, or the brief states the work runs at max effort.

FAIL if there is no Agent call, or neither the parameters nor the brief say max effort.
