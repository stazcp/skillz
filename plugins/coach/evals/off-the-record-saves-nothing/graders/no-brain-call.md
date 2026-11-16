---
type: tool_used
tool: Skill
input_match: 'brain'
min: 0
max: 0
arm: both
---

Saving goes through the brain skill (§4); off the record, it is never called.
An eval of plugins/coach doesn't load brain, so `no-session-write` is the check
that can fail here; this one guards runs where brain is installed.
