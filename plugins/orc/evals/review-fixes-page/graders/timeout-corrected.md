---
type: regex
target: {source: file, path: docs/sandbox.md}
pattern: '\b30\s*(s|sec|secs|seconds)\b'
flags: i
---

The page said 60 seconds; sbx/limits.js sets 30.
