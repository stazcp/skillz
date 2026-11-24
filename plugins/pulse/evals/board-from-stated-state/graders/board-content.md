---
type: llm
---

The user gave the state of a project "mobile-onboarding": units Sign-up form (active), Welcome tour and Push opt-in (queued); on Sign-up form build passed, 87 tests passing, review found the password field accepts an empty value, PR not raised; and one decision: block the form or show an inline warning.

PASS if the reply is a single box-drawn status board that lists all three units in order, shows the Sign-up form steps with the review problem marked as failed or having a problem (not done), shows the PR as not started, and asks exactly one question, about blocking the form versus an inline warning. Nothing may come before the board, and at most two short lines may follow it.
FAIL if it reports in prose paragraphs, drops a unit, marks the review step as done, asks more than one question, or puts an introduction above the board.
