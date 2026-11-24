---
name: pulse
description: Print a compact boxed status board in the terminal for multi-step or multi-layer work — what is done, what is running, what is blocked, and the one thing that needs the user. Use when the user says /pulse, "status", "where are we", "show the board", or asks for a short or glanceable summary of work in progress; and reprint it on your own whenever the state of long-running work changes (a step finishes, something fails, a PR is raised or merged, or you need a decision). Replaces long prose progress reports.
---

# Pulse

The user reads the terminal at a glance. The board is the report: one box, a
few short lines, nothing they have to parse. Detail exists only when asked for.

## The shape

Print it inside a `text` code fence so the columns hold. Inner width is fixed
at 58 characters; pad every line with spaces so the right border lines up.

```text
╭─ <project or task name> ─────────────────────────────────╮
│                                                          │
│  ◆  1  CSV export                needs you               │
│  ·  2  PDF export                queued                  │
│  ·  3  Email delivery            queued                  │
│                                                          │
├─ Layer 1 ────────────────────────────────────────────────┤
│                                                          │
│  build    ✔  done                                        │
│  tests    ✔  212 passing                                 │
│  browser  ✔  export downloads in 2s                      │
│  review   ✖  dates show in the wrong timezone            │
│  PR       ·  not raised                                  │
│  merge    ·  —                                           │
│                                                          │
├─ Needs you ──────────────────────────────────────────────┤
│                                                          │
│  Convert export dates to UTC, or to the                  │
│  account's timezone?                  UTC / account      │
│                                                          │
╰──────────────────────────────────────────────────────────╯
```

Three sections, top to bottom:

1. **The queue** — every unit of work (layer, PR, phase), numbered in order,
   one line each: symbol, number, name, state in one or two words.
2. **The active unit** — its steps, one line each: step name, symbol, a fact.
   Use the steps that are real for this work; build / tests / browser /
   review / PR / merge is the usual set for code. Omit this section when
   nothing is active.
3. **Needs you** — the single decision or action blocking progress, phrased
   as a question with its answers (`yes / no`, or two or three named
   options). Omit the section entirely when nothing is needed.

## Symbols

Only these, because each is one column wide in a terminal. No emoji: most
render two columns wide and break the right border.

| Symbol | Means |
|---|---|
| `✔` | done and verified |
| `▶` | running now |
| `✖` | failed or has a problem |
| `◆` | waiting on the user |
| `·` | not started |

## Rules

- **Facts, not narration.** A step's text is a result with its number where
  there is one: `395 passing`, `PR #81`, `2 of 3 checks green`. Never a
  sentence about what you did.
- **`✔` means you saw it pass.** A step someone reported but you could not
  check is `·` with `unverified`, or `✖` with the reason. Merge-ready is not
  merged; raised is not green.
- **One problem per line, in the user's words.** "dates in the wrong
  timezone", not a function name. File paths, fingerprints and reviewer wording stay out.
- **At most one question** in Needs you. If several things are blocked, ask
  the one that unblocks the most and hold the rest.
- **Keep it under about 22 lines.** More than six queue items: show the
  active one, the next two, and `· +N more queued`.
- **Truncate, never wrap, inside a row.** A fact that does not fit in the row
  is too long; shorten it. Only the Needs you text may run to a second line.
- **Nothing above the board, at most two lines below it.** The lines below
  are for something that cannot wait and does not fit a row — a risk the user
  must know about now. Otherwise print the board alone.

## When to print

- When the user asks (`/pulse`, "status", "where are we").
- On your own when state changes: a step completes or fails, a unit starts or
  finishes, a PR is raised or merged, or you need the user.
- Not on a timer, and not when nothing changed. If the user asks and nothing
  moved, print the board with one line under it: `no change since <time>`.

## Details on request

The board never expands on its own. When the user says "details", "why", or
names a row ("what failed in review?"), answer that row only, in a few short
lines or a small list, then stop. Offer nothing further unless asked.

## Where the state comes from

Use what this session already knows first. When resuming or unsure, read it
rather than recall it:

- Any run ledger or state file a workflow tool in this session keeps for
  the branch — phase, PR number, pass counts, stop reason.
- `git status`, `git log`, and `gh pr view` / `gh pr checks` for the branch.
- Any plan or spec the session is working from, for the queue order.

If a fact cannot be read, the row says `unknown`, never a guess.
