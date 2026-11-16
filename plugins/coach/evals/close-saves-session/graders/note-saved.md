---
type: file_exists
path: "vault/Career/Coaching/2026-*Coaching - *.md"
---

§4 files the note as `<Sessions>/YYYY-MM-DD Coaching - <topic>.md`. The date is
the run's own (`date`), so the pattern doesn't pin it. `file_exists` sees only
files the run created or changed, so the fixture's older note doesn't count.
