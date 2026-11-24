# orc-ledger

A status row for [orc](../orc). While orc's tier routing is on, it draws one
row above the prompt with this session's handoffs per tier and how many tier
agents are still running:

```
◆ orc  cheap 5 · fast 3  ● 1 running
```

After each turn that handed work off, it adds a one-line note naming the
tiers used.

`/orc-tree` opens a tree of the agents under the row, and the same command
hides it again, so it takes no space until you want it:

```
◆ orc  fast 1 · strong-wide 1  ● 1 running
├─ ▶ strong-wide  Fix the flaky test
│  ├─ ✔ cheap  Find callers  19s
│  └─ ▶ Explore  Search logs
└─ ✖ fast  Rename the flag  19s
```

`▶` is running, `✔` reported back, `✖` failed or was stopped, with how long
each took. Anything a tier agent starts is nested under it. The tree keeps the
last 40 agents and draws the newest 12 lines.

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
  the orchestrator. Either also resets the counts.
- Either way: "orc on" or "orc off" typed as a prompt of its own. The same
  words inside a longer prompt change nothing, so a sentence or pasted text
  can never switch the row by accident. "orc off" keeps the counts, and they
  come back with "orc on".

The row follows what you type, not what the model decides, so it can disagree
with orc for a moment: tell orc to stop in other words ("Actually, orc off: no
handoffs today") and the row stays until you send "orc off" by itself; a tier
agent starting brings it back.

Only agents the main conversation starts are counted, once each, when they
have really started. A tier agent that fans out to other tiers does not add to
the count (its agents show in the tree, nested under it), and neither does a
dispatch that was refused. Workflow stages and teammates running on a tier are
not counted, and are not in the tree.

## Develop

```
claude plugin validate plugins/orc-ledger
claude plugin test plugins/orc-ledger
claude --plugin-dir plugins/orc --plugin-dir plugins/orc-ledger
```
