---
type: regex
flags: i
pattern: 'search(?:(?!auth|billing|catalog|notify)(?:[^\n0-9]|\b\d{4}\b)){0,40}\b4\b|search(?:(?!auth|billing|catalog|notify)[^\n]){0,60}retries[^\n0-9]{0,6}\b4\b'
---
