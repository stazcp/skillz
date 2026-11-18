---
description: Under orc, a question that takes a chain of small lookups is one investigation and goes to an orc tier agent; at most two of the reads happen inline.
tags: [routing]
model: sonnet
max_turns: 8
timeout_seconds: 300
runs: 3
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

Turn on orc routing for this session. Then: downloading report-7 from this service returns 404, while report-3 works. Why? The code is under dlsvc/; the route table is dlsvc/routes.js.
