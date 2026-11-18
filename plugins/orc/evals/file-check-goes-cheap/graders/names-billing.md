---
type: regex
flags: i
pattern: '\bbilling\b(?:(?!auth|catalog|search|notify)(?:[^\n0-9]|\b\d{4}\b|\.js[:\d\-–]*|\b(?:line\s?|L)\d+\b)){0,40}(?<!\.js[:\d\-–]*|\b(?:line\s?|L)(?:\d+[\-–])?)\b5\b|\bbilling\b(?:(?!auth|catalog|search|notify)[^\n]){0,60}retries[^\n0-9]{0,6}\b5\b'
---
