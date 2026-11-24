---
description: '"Where are we" phrasing loads pulse, and the reply is one boxed board with the queue, the active unit''s steps and a single Needs you question.'
tags: [pulse, trigger, shape]
max_turns: 6
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
model: sonnet
runs: 3
---

Where are we? Here's the state, nothing else to look up. Project "mobile-onboarding". Three units in order: 1 Sign-up form (active), 2 Welcome tour (queued), 3 Push opt-in (queued). On Sign-up form: build passed, tests passed with 87 passing, review found the password field accepts an empty value, PR not raised yet. I need to decide whether to block the form or show an inline warning.
