# Contributing

Issues and pull requests are welcome. These plugins are shaped by daily use,
so a change that comes with the situation it fixes is the easiest to take.

## Before you open a pull request

1. Run the checks for what you changed:

   ```sh
   scripts/eval-changed.sh
   ```

   It runs the `claude plugin eval` suite of every plugin your branch touches,
   in cheap mode, and needs Claude Code signed in. For a mod, also run
   `claude plugin validate plugins/<name>` and `claude plugin test
   plugins/<name>`. [docs/evals.md](docs/evals.md) has the tool grants each
   suite needs and what the script does.

2. Open the pull request from a branch in this repository. Pull requests from
   forks fail the `leak-check` workflow by design (it cannot scan them safely),
   so a maintainer re-opens them from a branch here.
   [docs/leak-check.md](docs/leak-check.md) explains why.

3. Use the same title style as the history, `<plugin>: <what changed>`, and
   say in the description what changed, why, and how to check it. Merges are
   squash-only, and the title and description become the commit.

## Adding a plugin

A plugin is a folder under `plugins/` with a `.claude-plugin/plugin.json`, an
entry in `.claude-plugin/marketplace.json`, a section in the README, and an
`evals/` suite (or unit tests, for a mod). `plugins/pulse` is the smallest
complete example.

## Licence

By contributing you agree that your contribution is released under the
[MIT licence](LICENSE).
