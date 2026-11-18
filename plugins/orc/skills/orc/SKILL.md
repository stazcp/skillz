---
name: orc
description: >-
  Turn on tier handoffs in this session, routed on one test, "do I already
  have what I need?": answering, drafting, deciding and acting (commit, PR,
  gh, Slack) stay here; reading, searching, querying, testing and debugging go
  to a tier agent or a Workflow under a return contract, costly-mistake work
  gets a refuter;
  routes silently, asks only for costly or ambiguous choices, and hands off on
  demand
---

# orc

Read `../../agents/orchestrator.md`, relative to this skill's base directory, now,
in full, before writing anything, and follow it for the rest of this session.
It is the reference; don't restate it.

Adaptations, because this session was not launched as the orchestrator:

- **Tools.** You keep every tool you have.
- **Tiers.** orc:tier-cheap, orc:tier-fast, orc:tier-strong, orc:tier-max,
  orc:tier-strong-wide, orc:tier-max-wide and orc:tier-all-out are available
  through the Agent tool, as is `fork`.
- **Workflow.** The Workflow tool is available alongside the tiers when the
  host offers it, with the same tiers as `agentType`. Standing authorization
  comes from the user's CLAUDE.md: check only what is already loaded, once,
  and remember the answer. If no CLAUDE.md is in context, treat it as no
  standing authorization; a Workflow then needs the user's yes per task.
- **Top tier.** Your own model sets the top tier, exactly as a launch model
  would. On a session running below Opus, dispatch orc:tier-max and the
  -wide and all-out variants with `model: "opus"`.
- **Existing context.** Whatever this conversation already holds stays; the
  rules apply to new pieces from here on. Do not re-read or summarise earlier
  work to catch up, and remember that `fork` copies all of it.

Once it is read, the message that answers or carries out the task opens with
one line saying orc routing is on, and the answer follows in that same
message: not before the Read, not in a message of its own. This line is the
one exception to saying nothing about routing when everything was inline.

`/orc <task>` turns routing on and routes that task by the test, no question.
If you already have what it needs (an answer, a draft, a decision, a push,
commit, PR, `gh` or Slack action with the checks that action itself needs,
a small edit), do it here. If it needs reading, searching or running
anything, even one Grep, an Agent on the tier you pick (orc:tier-cheap to
read a few files); the one exception is a single targeted Read of a
`file:line` a worker cited, to check its claim.
Ask only when the rules themselves say to: a Workflow without standing
authorization, the first dispatch on a model stronger than the session's, or
a shape that could go either way where the difference matters.

"orc off" ends it: say so in one line and behave as a plain session for the
rest of the session. "orc on" restores it. Nothing persists; a new session
starts plain.

`claude --agent orc:orchestrator` at the shell is the same thing from the first turn.
