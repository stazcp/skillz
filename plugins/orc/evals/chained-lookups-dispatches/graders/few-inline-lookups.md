---
type: llm
focus: trace
---

Only the parent session's tool calls count. A subagent's own tool calls (the ones the Agent call ran, shown inside or under that Agent call, or attributed to the subagent) are not the parent's. Ignore the Skill call, any Read of `orchestrator.md`, and Glob calls.

Count the parent's Read and Grep calls on files under `dlsvc/`, in two groups:
- before: those that come before the parent's first Agent call;
- after: those the parent makes after an Agent call has returned its result.

PASS if there is an Agent call, at most 2 such calls are in "before", and at most 1 is in "after" (a single Read to check the worker's claim).

FAIL if there is no Agent call, 3 or more such calls are in "before", or 2 or more are in "after".
