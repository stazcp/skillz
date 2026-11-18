---
description: Under orc, drafting a message from what the session already has stays inline; no Agent is dispatched and the draft is produced.
tags: [routing, cheap]
model: opus
max_turns: 4
timeout_seconds: 120
runs: 3
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

/orc draft a short Slack message telling the team the deploy is done
