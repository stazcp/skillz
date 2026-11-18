#!/usr/bin/env bash
# Fake download service where one question ("why does report-7 404?") takes
# about eight small sequential reads: each file only names the next hop, and
# every file is well under a screen, so no single read or grep gives the answer.
# Cause: report-7 is on the "cold" shelf, whose backend is gated by the
# coldReads flag, which is false in the prod flag set that config/env.js picks.
set -euo pipefail
mkdir -p dlsvc/handlers dlsvc/catalog dlsvc/store dlsvc/config
cat > dlsvc/routes.js <<'J'
const { serveDownload } = require('./handlers/download');
const { serveHealth } = require('./handlers/health');
module.exports = [
  { method: 'GET', path: '/health', handler: serveHealth },
  { method: 'GET', path: '/download/:id', handler: serveDownload },
];
J
cat > dlsvc/handlers/health.js <<'J'
module.exports = { serveHealth: () => ({ status: 200, body: 'ok' }) };
J
cat > dlsvc/handlers/download.js <<'J'
const catalog = require('../catalog');
const store = require('../store');
function serveDownload(req) {
  const entry = catalog.find(req.params.id);
  if (!entry) return { status: 404, body: 'unknown id' };
  const handle = store.open(entry.shelf);
  if (!handle) return { status: 404, body: 'not available' };
  return { status: 200, body: handle.read(entry.file) };
}
module.exports = { serveDownload };
J
cat > dlsvc/catalog/index.js <<'J'
const entries = require('./entries.json');
module.exports = { find: (id) => entries[id] || null };
J
cat > dlsvc/catalog/entries.json <<'J'
{
  "report-1": { "shelf": "hot", "file": "2026/report-1.pdf" },
  "report-3": { "shelf": "hot", "file": "2026/report-3.pdf" },
  "report-5": { "shelf": "warm", "file": "2025/report-5.pdf" },
  "report-7": { "shelf": "cold", "file": "2023/report-7.pdf" }
}
J
cat > dlsvc/store/index.js <<'J'
const backends = require('./backends');
const gates = require('../config/gates');
function open(shelf) {
  const backend = backends[shelf];
  if (!backend) return null;
  if (backend.gate && !gates.isOpen(backend.gate)) return null;
  return { read: (file) => `${backend.root}/${file}` };
}
module.exports = { open };
J
cat > dlsvc/store/backends.js <<'J'
module.exports = {
  hot: { root: '/srv/hot' },
  warm: { root: '/srv/warm', gate: 'warmReads' },
  cold: { root: '/mnt/glacier', gate: 'coldReads' },
};
J
cat > dlsvc/config/gates.js <<'J'
const { flagSet } = require('./env');
const flags = require(`./flags.${flagSet}.json`);
module.exports = { isOpen: (name) => flags[name] === true };
J
cat > dlsvc/config/env.js <<'J'
// Which flag set this deployment loads.
module.exports = { flagSet: 'prod', region: 'eu-west-1' };
J
cat > dlsvc/config/flags.dev.json <<'J'
{ "warmReads": true, "coldReads": true, "betaUploads": true }
J
cat > dlsvc/config/flags.prod.json <<'J'
{ "warmReads": true, "coldReads": false, "betaUploads": false }
J
git init -q . && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm init
