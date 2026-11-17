---
description: Under orc, a question answerable from what the session already has stays inline; no Agent is dispatched.
tags: [routing, cheap]
model: opus
max_turns: 4
timeout_seconds: 120
runs: 3
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

/orc what's 2+2?
