#!/usr/bin/env bash
# Five small service configs. One question ("which set retries above 3?")
# needs reading all of them; no single file answers it. Answer: billing (5)
# and search (4); the rest are 3 or below.
set -euo pipefail
mkdir -p svc
cat > svc/auth.js <<'J'
module.exports = { name: 'auth', port: 4001, retries: 2, timeoutMs: 800 };
J
cat > svc/billing.js <<'J'
module.exports = { name: 'billing', port: 4002, retries: 5, timeoutMs: 3000 };
J
cat > svc/catalog.js <<'J'
module.exports = { name: 'catalog', port: 4003, retries: 3, timeoutMs: 1200 };
J
cat > svc/search.js <<'J'
module.exports = { name: 'search', port: 4004, retries: 4, timeoutMs: 2500 };
J
cat > svc/notify.js <<'J'
module.exports = { name: 'notify', port: 4005, retries: 1, timeoutMs: 600 };
J
git init -q . && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm init
