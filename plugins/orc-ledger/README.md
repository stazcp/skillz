# orc-ledger

A status row for [orc](../orc) that shows what orc has out right now. While
tier routing is on, it draws one row above the prompt with the tier agents
still running, per tier:

```
◆ orc  strong 1 · max 2  ● 3 running
```

When nothing is out the row reads `◆ orc  idle`. After each turn that handed
work off, it adds a one-line note with that turn's handoffs per tier.

`/orc-tree` opens a tree of the running agents under the row, and the same
command hides it again, so it takes no space until you want it:

```
◆ orc  fast 1 · strong-wide 1  ● 2 running
├─ ▶ strong-wide  Fix the flaky test
│  ├─ ▶ cheap  Find callers
│  └─ ▶ Explore  Search logs
└─ ▶ fast  Rename the flag
```

Anything a tier agent starts is nested under it. An agent leaves the tree as
soon as it is back, so the tree is only ever as long as what is running; it
draws at most 12 lines and says how many more there are.

A workflow is one line saying how many of its stages are back, with the stages
still out listed under it:

```
◆ orc  cheap 1 · max 1  ● 2 running
├─ ▶ workflow  triage-open-issues  2 of 3 back
│  └─ ▶ max  refute #332
└─ ▶ cheap  Count the tests
```

The session's totals are not on screen. `/orc-tree` answers with them each
time you run it (`Handoffs so far: cheap 4, strong 2`).

It only watches. It never blocks a tool call, never adds text the model
reads, and changes nothing about how orc routes, so orc behaves the same
with or without it.

## Install

```
/plugin marketplace add stazcp/skillz
/plugin install orc@staz
/plugin install orc-ledger@staz
```

Needs Claude Code 2.1.329 or later. This plugin is a hooks module (a "mod"),
an early-access part of Claude Code that can change between releases.

## What turns the row on and off

- On: `/orc`, the orc skill loading by itself, `claude --agent orc:orchestrator`,
  or any `orc:tier-*` agent the main conversation starts.
- Off: `/clear` or resuming another conversation, unless the session runs as
  the orchestrator. Either also forgets the agents and the session's totals.
- Either way: "orc on" or "orc off" typed as a prompt of its own. The same
  words inside a longer prompt change nothing, so a sentence or pasted text
  can never switch the row by accident. "orc off" only hides the row: agents
  still out are there again after "orc on".

The row follows what you type, not what the model decides, so it can disagree
with orc for a moment: tell orc to stop in other words ("Actually, orc off: no
handoffs today") and the row stays until you send "orc off" by itself; a tier
agent starting brings it back.

Only agents the main conversation starts are counted in the row, from the
moment they have really started until they report back; a workflow's stages on
a tier count the same way. A tier agent that fans out to other tiers does not
add to the row (its agents show in the tree, nested under it), and neither
does a dispatch that was refused. Teammates running on a tier are not counted,
and are not in the tree. A workflow stage whose run is stopped midway stays
shown until the next `/clear`, because nothing says it ended.

## Develop

```
claude plugin validate plugins/orc-ledger
claude plugin test plugins/orc-ledger
claude --plugin-dir plugins/orc --plugin-dir plugins/orc-ledger
```
