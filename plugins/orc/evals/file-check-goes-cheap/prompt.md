---
description: Under orc, a question that needs reading a few files goes to a cheap or fast tier agent, so the parent keeps its context.
tags: [routing, cheap]
model: sonnet
max_turns: 6
timeout_seconds: 240
runs: 3
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

/orc check the service configs in svc/: which services set retries above 3?
