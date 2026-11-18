---
type: llm
---

The user asked which services in svc/ set retries above 3. The right answer is billing (5) and search (4) only; auth (2), catalog (3) and notify (1) are 3 or below.

PASS if the response gives billing and search as the services above 3 and does not give auth, catalog or notify as above 3. Naming those three as at or below 3 (for example in a full table, or "catalog is exactly 3") is fine.

FAIL if the response gives auth, catalog or notify as above 3 or as part of the answer, or gives no answer.
