# Staz's skillz

[![leak-check](https://github.com/stazcp/skillz/actions/workflows/leak-check.yml/badge.svg?branch=main)](https://github.com/stazcp/skillz/actions/workflows/leak-check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**A stack that augments your harness with superpowers.**

Claude Code plugins I use every day, for personal and work projects. Each one
is a skill, an agent or a mod you install on its own; none needs the others,
except where the table says so.

| Plugin | What it does |
|---|---|
| [orc](#orc) | An orchestrator: your main session keeps the work and hands a piece to a cheaper or stronger model only when that pays off |
| [orc-ledger](#orc-ledger) | Optional mod for orc: a row above the prompt showing handoffs per tier and agents still running (needs orc) |
| [brain](#brain) | Save notes to, and recall them from, your Obsidian vaults |
| [dream](#dream) | Consolidate memory notes the way sleep does: merge, retire, index, from a plan you approve |
| [review-pr](#review-pr) | Review someone else's pull request with an agent at your side, and approve the draft before anything is posted |
| [presentation](#presentation) | Turn a dense doc or issue into a short animated HTML explainer |
| [standup](#standup) | A Yesterday / Today / Blockers report from your real GitHub activity |
| [coach](#coach) | A career coach with memory, kept in your brain vault (needs brain) |
| [pulse](#pulse) | A boxed status board in the terminal for multi-step work |

With orc and orc-ledger installed, the prompt shows what has been handed off:

```
◆ orc  cheap 5 · fast 3  ● 1 running
```

## Install

```
/plugin marketplace add stazcp/skillz
/plugin install orc@staz
/plugin install brain@staz
/plugin install dream@staz
/plugin install review-pr@staz
/plugin install presentation@staz
/plugin install standup@staz
/plugin install coach@staz
/plugin install pulse@staz
```

Or, from a checkout of this repo, install them all in one go:

```sh
scripts/install.sh              # every plugin
scripts/install.sh --with-mods  # every plugin, plus the optional mods
```

Mods are optional. A mod is a plugin that runs code inside Claude Code to
change its interface; the only one here is [orc-ledger](#orc-ledger), a status
row for orc, which needs Claude Code 2.1.329 or later. They are early access,
so the plain install leaves them out. `--with-mods` adds them to an existing
install and leaves out, with a note, any mod your Claude Code is too old for.
`claude plugin uninstall orc-ledger@staz` takes one off again, and `--dry-run`
prints the commands without running them.

## orc

orc is short for orchestrator.

Your main session keeps doing the work. It hands a piece to a tier agent only
when that pays off:

- the piece would fill your context with output you won't need again, such as a broad search or a log dig
- it needs a cheaper model, or a stronger one, or a different effort level
- it splits into independent pieces that can run in parallel

When a piece qualifies, orc asks you first and recommends an option. You can
also ask for a handoff at any time: "hand this off", "send it to tier-fast",
"fan this out".

### Use it

| | |
|---|---|
| `/orc` | Turn handoffs on for this session |
| `/orc <task>` | Get handoff options for one task right away |
| `orc off` | Back to a plain session |
| `claude --agent orc:orchestrator` | Handoffs on from the first turn, for the whole session |

`/orc` is the easy way to try it, because nothing changes until you ask.
`--agent orc:orchestrator` puts the rules in the system prompt, so they hold better
over long sessions.

### Tiers

| Agent | Model, effort | For |
|---|---|---|
| `orc:tier-cheap` (experimental) | Haiku | Lookups, and mechanical commands where the exact command is given. Never edits. |
| `orc:tier-fast` | Sonnet, low | One or two files, an obvious change, a summary |
| `orc:tier-strong` | Opus, medium | Several files, debugging with a repro, tests |
| `orc:tier-max` | your session's model, high | Unclear goal, no repro, or high stakes |
| `orc:tier-strong-wide`, `orc:tier-max-wide` | as above | Same, but may fan out to lower tiers and to parallel searches |
| `orc:tier-all-out` | your session's model, max | Only when you ask for it |

Start your session on Opus, or on Fable if your account has it. Each subagent
starts cold, with roughly 15–25k tokens of context. orc routes on one test,
"do I already have what I need?": answering, drafting, deciding and git/PR
actions stay in your session; anything that reads, searches or runs goes to a
worker, so your context keeps only conclusions.

For a Workflow that edits, your session assigns the issue and creates a
branch and worktree per item (or one for the run) first; stages that edit one
after another share it, and only agents editing the same worktree at the same
time get their own. A page or
diff with many claims gets a review: 2-3 reviewers with different lenses
return findings, a fixer re-checks each one before applying it, and a
verifier closes. Each item comes back as one small record (path, findings
applied and rejected, what is left). Suspected vulnerabilities go in a
`private` field that never reaches the edited files, commit messages or PR
bodies, and they keep the item open until you decide.

## orc-ledger

An optional mod that shows what orc is doing. While routing is on it draws one
row above the prompt, with this session's handoffs per tier and how many tier
agents are still running:

```
◆ orc  cheap 5 · fast 3  ● 1 running
```

After each turn that handed work off, it adds a one-line note naming the tiers
used. It only watches: it never blocks a call or adds anything the model
reads, so orc routes the same with or without it.

```
/plugin install orc-ledger@staz
```

It needs orc installed, and Claude Code 2.1.329 or later. See
[its README](plugins/orc-ledger/README.md) for what turns the row on and off.

## brain

Save notes to your Obsidian vaults, and recall them, from inside a session.
It handles more than one vault, for example one per job and a personal one,
and won't write one vault's notes into another.

| | |
|---|---|
| `/brain <text>` | Save a note. "Save that" works, because it reads the conversation |
| `/brain ? <query>` | Answer from your notes, citing each note it used |
| `/brain session` | Write up this conversation: decisions, findings, open questions, links |
| `/brain @<vault> …` | Use a vault other than the default |
| `/brain --setup` | Find your vaults and write a spec for each |

Each vault has a short spec at `~/.config/brain/<name>.md` (or under
`$BRAIN_HOME`) that sets its path, what belongs in it, how files are named and
filed, and whether it commits to git. `~/.config/brain/active` holds the
default vault's name; an `active.local` next to it wins, for a machine that
should default to a different vault. Run `/brain --setup` to write the specs, or copy
[`vault-template.md`](plugins/brain/skills/brain/vault-template.md).

If a vault's spec names a git remote, brain pushes after each commit, but only
once [gitleaks](https://github.com/gitleaks/gitleaks) finds no secrets in it.
Without gitleaks it commits and doesn't push.

It isn't tied to Obsidian. Any folder of Markdown notes works, such as a
Logseq or Foam graph, or a plain folder in a git repo. `--setup` only finds
Obsidian vaults by itself, so give it the folder's path for anything else. If
your tool doesn't read `[[wikilinks]]`, set the link style in the spec's
Conventions section.

## dream

Consolidate and organize a pile of memory notes the way sleep consolidates a
day. It works on Claude's auto-memory, a `brain` vault, or any folder of
Markdown.

| | |
|---|---|
| `/dream` | Ask which memory files or collections to improve |
| `/dream memory` | Claude's auto-memory for the current project |
| `/dream @<vault>` | A `brain` vault, following that vault's spec |
| `/dream <path>` | Any file or folder of Markdown |
| `/dream … --plan-only` | Write the plan and stop |

It reads everything, checks claims it can check, then groups notes by topic,
merges near-duplicates, resolves contradictions (newer wins), retires
superseded entries, makes dates absolute and links related notes. A big
collection gets an index or table of contents, which it keeps in sync. It
takes a backup and shows you a plan first, and changes nothing until you say
so. A vault never loses a note: superseded ones are archived or marked.

## review-pr

Review someone else's PR with an agent at your side, including code in a
language you don't read well.

`/review-pr <pr>` explains what the PR does in plain terms, with a glossary in
a language you do know. It reviews the PR against the repo's own docs and your
notes (through `brain`, if you have it), and has a separate agent try to break
each finding before you see it. Each finding comes with a what-could-go-wrong
story, a trace you can click through, and the author's likely pushback. It
drafts the review in your voice and posts nothing until you say so.

## presentation

`/presentation <source>` turns a dense doc, page, issue or topic into a short
animated step-through HTML explainer: 8 to 12 scenes, one diagram each, built
only from the source, with Confirmed / Likely / Not known chips so the reader
can see what is solid. It writes one self-contained file and never publishes.

## standup

`/standup` builds a Yesterday / Today / Blockers report from your real GitHub
activity (PRs, issues, commits). Plain text to read out or paste; it never
posts.

## coach

`/coach` is a career coach with memory. Before it says anything it reads your
career notes and your last three coaching sessions from your brain vault.
It opens by asking about last time's commitments, asks questions before it
gives advice, gives a straight opinion when you ask "wdyt", and holds you to
your own stated goals. When you're done it saves the session (what came up,
decisions, dated commitments) back to the vault through brain.

| | |
|---|---|
| `/coach [topic]` | A session: decisions, mock interviews, negotiation role-play, promotion, check-ins |
| `/coach review` | Patterns across sessions: commitments kept, recurring themes, what's stuck |
| `/coach --setup` | Pick the vault, the standing career notes and the sessions folder |
| `claude --agent coach:coach` | A whole session as a coaching session, from the first turn |

`/coach` drops a coach into whatever session you're in. `--agent coach:coach`
makes the whole session a coaching session: the rules sit in the system
prompt, so they hold over a long talk, and it has no web, MCP (Slack, GitHub
and the like) or subagent tools. Its file and shell tools can still reach any
path, so keeping the session inside the vault (and the vault's git remote,
when brain pushes) is by instruction, not enforced.
Pass `--setup` or `review` as the first message. A shell alias makes it one
word: `alias coach='claude --agent coach:coach --model opus'`.

Say "off the record" at any point and nothing is saved. Its config is
`coach.md` in `$SKILLZ_CONTEXT` (default `~/.config/skillz`); see
[`coach-template.md`](plugins/coach/skills/coach/coach-template.md). It needs
brain set up first.

## pulse

`/pulse` prints a compact boxed status board in the terminal for multi-step
work: the queue of units, the steps of the active one, and the one decision
that needs you. Say "status" or "where are we" and it prints too, and it
reprints on its own when something changes (a step finishes or fails, a PR is
raised or merged). `✔` only for what it saw pass, no prose above the board,
and detail only when you ask for a row.

```text
╭─ Report exports ─────────────────────────────────────────╮
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

## Private settings

Some skills read optional private settings from one folder: `$SKILLZ_CONTEXT`,
or `~/.config/skillz` when that is unset. Every file in it is optional; with
none, the skills fall back to safe defaults.

| File | Read by | Holds |
|---|---|---|
| `prefs.md` | standup | `github_user`, `gh_orgs`, your main focus |
| `notes.md` | standup | standing input GitHub can't see: non-PR work, blockers, time off |
| `presentation.md` | presentation | default output folder, how to save there, audience default |
| `coach.md` | coach | the career vault, standing notes, sessions folder, preferences |
| `private-terms` | `scripts/leak-check` | strings that must never reach this public repo, one per line |
| `hooks/pre-push` | git, via `core.hooksPath` | the installed pre-push leak check ([docs/leak-check.md](docs/leak-check.md)) |

Keep the folder wherever you keep private config (a dotfiles repo, say) and
symlink it to `~/.config/skillz`. `brain` keeps its vault specs separately, in
`~/.config/brain`.

## Development

Each skill plugin has a `claude plugin eval` suite, and a mod has unit tests.
`scripts/eval-changed.sh` runs the suites of whatever a branch changed, and CI
runs it on every pull request. See [docs/evals.md](docs/evals.md).

This repo is public and the notes the skills read are not, so a leak check
blocks any push, pull request or commit that would publish a term from a
private list. See [docs/leak-check.md](docs/leak-check.md).

[CONTRIBUTING.md](CONTRIBUTING.md) has the short version of both.

## License

MIT
