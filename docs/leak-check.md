# Leak check

This repo is public; the notes and settings the skills read are not.
`scripts/leak-check` fails on anything that would publish a term from a
private list. It guards against accidental publication by the owner and the
owner's agents, and against outsiders using CI to learn the list. It does not
guard against the owner deliberately disguising a term (homoglyphs, base64,
encryption).

For every commit it scans the author, committer and message, the full new
content of each file the commit adds or changes (raw bytes: `.gitattributes`
and replace refs are ignored; UTF-8, UTF-16 and UTF-32 are decoded; zip, gzip,
zlib, bzip2 and xz content is opened), every path and directory added,
deleted or renamed, and symlink targets. It also scans ref names, annotated
tags and any text you hand it. Terms and text are normalized alike (NFKC,
case-folded, invisible characters dropped, whitespace and newlines
collapsed), each file or message is matched whole, and further passes undo
HTML, JSON/JS escapes, %-escapes and Markdown emphasis. In names and
identities, `-`, `_`, `/`, `.` and Unicode dashes count as spaces. A commit
message or PR text holding a CI skip instruction also fails, so the backstop
can't be silenced. Output names where a term matched and its number in the
list, never the term; on GitHub Actions it prints only a fixed line.

On a public repo a branch, its commits and a PR's title and body are public
the moment they are pushed or opened, so the gates run before publishing:

1. **pre-push** (`scripts/pre-push`, installed outside the checkout so every
   branch, worktree and old commit runs it): runs origin/main's scanner over
   every commit the destination doesn't already have, every pushed branch
   and tag name, and annotated tag messages. Install it once per machine and
   enable it in each clone:

   ```sh
   mkdir -p ~/.config/skillz/hooks
   git cat-file blob origin/main:scripts/pre-push > ~/.config/skillz/hooks/pre-push
   chmod +x ~/.config/skillz/hooks/pre-push
   git config core.hooksPath "$HOME/.config/skillz/hooks"
   ```

   `scripts/eval-changed.sh` warns when the hook is missing or stale, and
   runs the scan itself.
2. **Claude Code hook** (`leak-guard.sh`, kept in the owner's dotfiles):
   blocks a `gh` command (PR, issue, release, `gh api`, ...) or a script run
   whose text, or any file it names, holds a term, and a push here that
   would skip the pre-push hook.
3. **CI** (`leak-check` workflow, a required check): `pull_request_target`
   runs the base branch's scanner over the PR's commits (fetched as data,
   never run), head branch, title and body, read from the event file, never
   from the log-visible step env. PRs from forks are not scanned and fail; a
   maintainer re-opens them from a branch here. A push to `main` is
   rescanned. Merges are squash-only, with the commit title and message
   taken from the PR title and body, which this check has scanned.

```sh
python3 -I scripts/leak-check --range origin/main HEAD --worktree   # this branch
python3 -I scripts/leak-check --all                                 # audit everything
```

Locally the terms come from `private-terms` in your private settings folder
([README, Private settings](../README.md#private-settings)), one per line. Blank lines and `#` comments are skipped; write `\#`
at the start of a term that begins with `#`. CI reads the `PRIVATE_TERMS`
secret. GitHub masks a secret line by line, so set it from the filtered list
(no comments, blank lines or surrounding spaces), never the raw file. Run
this yourself, in your own terminal:

```sh
tr -d '\r' < ~/.config/skillz/private-terms | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^#/d' -e '/^$/d' | gh secret set PRIVATE_TERMS -R stazcp/skillz
```

Known limits: PR and issue comments, reviews, and releases made or edited
in the GitHub web UI, or by a tool other than `gh` in Claude's Bash (a GitHub
MCP server, say), are not checked (CI rescans a PR's title and body after an
edit, but by then they are public); a push from a clone without the hook,
or with it skipped, is caught only by CI, after the branch is public; Git LFS
content is not scanned, only its pointer files; text inside images, PDFs'
non-zlib streams, encrypted or other archive formats, or base64 is not
decoded; a multi-word term written joined (`johnsmith` for "john smith"),
or wrapped across quote- or comment-prefixed lines (`> john` / `> smith`,
`# john` / `# smith`), does not match, so list the variants that matter; the Claude hook does not read
scripts run through `make` or another interpreter (`python x.py`); `--all`
may report history that predates the check.
