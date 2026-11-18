---
type: regex
flags: i
pattern: '\bsearch\b(?:(?!auth|billing|catalog|notify)(?:[^\n0-9]|\b\d{4}\b|\.js[:\d\-–]*|\b(?:line\s?|L)\d+\b)){0,40}(?<!\.js[:\d\-–]*|\b(?:line\s?|L)(?:\d+[\-–])?)\b4\b|\bsearch\b(?:(?!auth|billing|catalog|notify)[^\n]){0,60}retries[^\n0-9]{0,6}\b4\b'
---
