# Evals

Each skill plugin has a `claude plugin eval` suite under `plugins/<name>/evals/`
(skill fires on its trigger, the output has the right shape, the never-post /
never-publish rails hold). A mod has unit tests in place of evals: run
`claude plugin validate plugins/orc-ledger` and `claude plugin test
plugins/orc-ledger` (CI does not run these yet). Fixtures are built by each
case's `fixture.sh`, so pass `--scaffold`:

```sh
claude plugin eval plugins/orc --scaffold --runs 1
claude plugin eval plugins/standup --scaffold --runs 1 --allow-tools Bash
claude plugin eval plugins/coach --scaffold --runs 1 --allow-tools Write Edit Bash
claude plugin eval plugins/review-pr --scaffold --runs 1 --allow-tools "Bash(git *)"
```

presentation needs a bare `--allow-tools Write` to save its file. brain writes
to a throwaway vault in the run's temp HOME; its fixture refuses to run against
a real home directory. dream needs `--allow-tools Write Edit Bash`: Write and
Bash for its backup and plan under the temp HOME, Edit to apply an approved plan
(its `apply-after-yes` case replays the approval from `history.jsonl`); its
fixtures have the same guard.

`scripts/eval-changed.sh` runs the suites of the plugins changed against
`origin/main` (committed and uncommitted), with those grants, in cheap mode
(`--runs 1 --ablation none`), a per-plugin cost cap and one rerun of each
failing case. `--all` runs every plugin, `--base <ref>` changes the base,
`--max-cost-usd <usd>` sets the cap (default 3), `--dry-run` prints the
commands. Locally it also snapshots your real brain vaults around the brain,
presentation and coach suites and stops if one changed. A pass on a clean tree
writes `$(git rev-parse --git-common-dir)/evals-passed/<HEAD sha>`. CI runs the
same script as the `evals` check on every PR (needs the `CLAUDE_CODE_OAUTH_TOKEN`
secret).
