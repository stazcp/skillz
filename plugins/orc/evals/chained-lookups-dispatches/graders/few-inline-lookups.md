---
type: llm
focus: trace
---

Find the first Agent tool call in the trace. Count the Read and Grep tool calls on files under `dlsvc/` that come BEFORE it. Ignore the Skill call, any Read of `orchestrator.md`, Glob calls, and every tool call after that Agent call (those are the worker's).

PASS if there is an Agent call and at most 2 such Read or Grep calls come before it.

FAIL if there is no Agent call, or 3 or more Read or Grep calls on `dlsvc/` files come before the first one.
