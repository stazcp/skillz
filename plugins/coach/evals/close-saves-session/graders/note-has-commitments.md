---
type: tool_used
tool: Write
input_match: '## Commitments(\\n)+(- \[.\] [^\\]*\\n)*- \[ \] [^\\]*2026-\d\d-\d\d'
---

The note has a `## Commitments` section with an open, dated checkbox (§4). The
filename carries the run date, which a file-target grader can't name, so this
checks the Write that created it; `\n` is the escaped newline in the tool input.
An eval of plugins/coach doesn't load brain, so this is the §4 brain-missing
fallback's Write.
