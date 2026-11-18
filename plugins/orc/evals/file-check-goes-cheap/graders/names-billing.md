---
type: regex
flags: i
pattern: 'billing(?:(?!auth|catalog|search|notify)(?:[^\n0-9]|\b\d{4}\b|\.js:\d+\b)){0,40}(?<!\.js:)\b5\b|billing(?:(?!auth|catalog|search|notify)[^\n]){0,60}retries[^\n0-9]{0,6}\b5\b'
---
