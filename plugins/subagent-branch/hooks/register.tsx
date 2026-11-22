import type { EngineInterface, Register } from 'claude-code'

// Replaces the deprecated `subagentStatusLine` script: each subagent row's body
// becomes "<branch> name · description · 12k", the branch in cyan. A row whose
// cwd has no branch (not a repo, detached HEAD, missing cwd) keeps the default.

const MAXLEN = 24
const TTL_MS = 5000
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'

type Entry = { at: number; branch: Promise<string> }
const cache = new Map<string, Entry>()

const truncate = (b: string): string => {
  const chars = Array.from(b)
  return chars.length > MAXLEN ? chars.slice(0, MAXLEN - 1).join('') + '…' : b
}

function branchFor($: Pick<EngineInterface, 'process'>, cwd: string, now: number): Promise<string> {
  const hit = cache.get(cwd)
  if (hit && now - hit.at < TTL_MS) return hit.branch
  const branch = $.process
    .run(['git', '-C', cwd, 'branch', '--show-current'], { timeoutMs: 2000 })
    .then(r => (r.exitCode === 0 ? r.stdout.trim() : ''))
    .catch(() => '')
  cache.set(cwd, { at: now, branch })
  return branch
}

export const register: Register = on => {
  on('ui.render', { component: 'AgentRow' }, async ($, e, next) => {
    const p = e.props
    if (!p.cwd) return next(e)

    const branch = await branchFor($, p.cwd, await $.clock.now())
    if (!branch) return next(e)

    let body = p.name || p.label || 'agent'
    if (p.description) body += ` · ${p.description}`
    body += ` · ${Math.floor((p.tokenCount ?? 0) / 1000)}k`

    return next({ ...e, props: { ...p, body: `${CYAN}${truncate(branch)}${RESET} ${body}` } })
  })
}
