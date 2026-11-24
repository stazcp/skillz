import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { Ledger, TreeAgent } from '../types'

const EMPTY: Ledger = { turn: [], session: {}, running: [], agents: [] }
const ORCHESTRATOR = 'orc:orchestrator'
const SKILLS = new Set(['orc', 'orc:orc'])
const TIER = /^orc:tier-/
// "orc on" or "orc off" as the whole prompt, so the words inside a sentence, a
// question or pasted text can never switch the row by accident.
const SWITCH = /^\s*orc (on|off)\s*[.!]?\s*$/i
// Where a prompt is the person's own: typed here, from their other device, or
// handed in by the program driving the session. Never a notification or a peer.
const PERSON = new Set(['composer', 'bridge', 'sdk'])
const COMMAND = 'orc-tree'
// The tree keeps this many agents and draws at most this many lines.
const KEPT = 40
const LINES = 12

// Cheapest first, each in a theme colour so the row follows the person's theme.
const TIERS: readonly (readonly [string, Color])[] = [
  ['cheap', 'success'],
  ['fast', 'suggestion'],
  ['strong', 'permission'],
  ['strong-wide', 'permission'],
  ['max', 'claude'],
  ['max-wide', 'claude'],
  ['all-out', 'error'],
]
const MARK = {
  running: ['▶', 'claude'],
  done: ['✔', 'success'],
  failed: ['✖', 'error'],
} as const satisfies Record<TreeAgent['state'], readonly [string, Color]>

const isOn = atom({ plugin: 'orc-ledger', key: 'isOn' } as const, false)
const isTreeOpen = atom(
  { plugin: 'orc-ledger', key: 'isTreeOpen' } as const,
  false,
)
const ledger = atom({ plugin: 'orc-ledger', key: 'ledger' } as const, EMPTY, {
  shape: 'ledger-4',
})

const short = (type: string) => type.replace('orc:tier-', '')

const colorOf = (type: string): Color | undefined =>
  TIERS.find(([name]) => `orc:tier-${name}` === type)?.[1]

const isOrchestrator = async ($: EngineInterface) =>
  (await $.session.info()).agentType === ORCHESTRATOR

/** The tree's lines, parents before their children, with the branch drawn. */
const lines = (agents: readonly TreeAgent[]) => {
  const known = new Set(agents.map(one => one.id))
  const out: { agent: TreeAgent; branch: string }[] = []
  const walk = (parent: string | undefined, indent: string) => {
    const children = agents.filter(one =>
      parent === undefined
        ? one.parent === undefined || !known.has(one.parent)
        : one.parent === parent,
    )
    children.forEach((agent, i) => {
      const isLast = i === children.length - 1
      out.push({ agent, branch: `${indent}${isLast ? '└─' : '├─'}` })
      walk(agent.id, `${indent}${isLast ? '   ' : '│  '}`)
    })
  }
  walk(undefined, '')

  return out
}

// This mod only watches: every hook passes the event on unchanged, and one
// that fails is skipped, so orc behaves the same with or without it.
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show or hide the tree of agents orc has handed work to',
    })
    // Launched as the orchestrator, routing is on from the first turn.
    if (await isOrchestrator($)) await update($, isOn, () => true)

    return next(e)
  })

  // `/orc-tree` shows the tree under the row, and hides it again.
  on('command.run', { command: COMMAND }, async $ => {
    const isOpen = await update($, isTreeOpen, open => !open)

    return { text: isOpen ? 'orc tree shown.' : 'orc tree hidden.' }
  })

  // A /clear or a resume puts another conversation in the same process: orc's
  // rules left with the old one unless the session itself runs as the
  // orchestrator, and its counts are not the new one's.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      const stays = await isOrchestrator($)
      await update($, ledger, () => EMPTY)
      await update($, isOn, () => stays)
    }

    return next(e)
  })

  // The orc skill loading (`/orc`, or the model picking it up) turns it on.
  on('skill.prompt', async ($, e, next) => {
    if (SKILLS.has(e.skill)) await update($, isOn, () => true)

    return next(e)
  })

  // "orc off" or "orc on", typed by the person as a prompt of its own.
  on('prompt.submit', async ($, e, next) => {
    const said = SWITCH.exec(e.text)?.[1]?.toLowerCase()

    if (said !== undefined && e.isMeta !== true && PERSON.has(e.origin.kind)) {
      await update($, isOn, () => said === 'on')
    }

    return next(e)
  })

  // A tier agent the main conversation starts is one handoff, counted once it
  // has really started: a refused or failed dispatch never gets an id. The
  // tree also takes whatever a tier agent in it goes on to start.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const type = e.subagentType
    const id = started.agentId
    // A workflow stage or a teammate never reports back here, so it could
    // never stop running.
    const isTracked =
      id !== undefined && e.workflow === undefined && e.isTeammate !== true

    if (!isTracked) return started

    const isHandoff = e.parentAgentId === undefined && TIER.test(type)
    const { agents } = await read($, ledger)
    const isChild = agents.some(one => one.id === e.parentAgentId)

    if (!isHandoff && !isChild) return started

    const startedAt = await $.clock.now()
    const agent: TreeAgent = {
      id,
      parent: e.parentAgentId,
      type,
      label: e.description,
      state: 'running',
      startedAt,
    }
    // A tier dispatch means routing is on, however it was turned on.
    if (isHandoff) await update($, isOn, () => true)
    await update($, ledger, l => ({
      // A resumed agent is running again, and is the handoff it already was.
      turn:
        isHandoff && !e.resume ? [...l.turn, { tier: type, model: e.model }] : l.turn,
      session:
        isHandoff && !e.resume
          ? { ...l.session, [type]: (l.session[type] ?? 0) + 1 }
          : l.session,
      running: isHandoff ? [...l.running.filter(one => one !== id), id] : l.running,
      agents: [...l.agents.filter(one => one.id !== id), agent].slice(-KEPT),
    }))

    return started
  }).catch(($, e, next) => next(e))

  // An agent that reports back is no longer running; matched by id, so a
  // second report of the same agent changes nothing.
  on('agent.report', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, ledger, l => ({
      ...l,
      running: l.running.filter(one => one !== e.agentId),
      agents: l.agents.map(one =>
        one.id === e.agentId && one.state === 'running'
          ? {
              ...one,
              state: e.status === 'completed' ? ('done' as const) : ('failed' as const),
              seconds: Math.max(0, Math.round((now - one.startedAt) / 1000)),
            }
          : one,
      ),
    }))

    return next(e)
  }).catch(($, e, next) => next(e))

  // The main conversation's turn alone: a tier agent's own turn ends here too.
  on('turn.complete', async ($, e, next) => {
    const { turn } = await read($, ledger)

    if (e.agentId === undefined && turn.length > 0) {
      const line = turn
        .map(h => [short(h.tier), h.model].filter(Boolean).join(' '))
        .join(', ')
      $.ui.toast(`orc handed off: ${line}`)
      await update($, ledger, l => ({ ...l, turn: [] }))
    }

    return next(e)
  })

  // One row above the prompt:  ◆ orc  cheap 3 · fast 1  ● 1 running
  // and, while `/orc-tree` has it open, the tree of agents under it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOn))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const { session, running, agents } = await read($, ledger)
    const isOpen = await read($, isTreeOpen)
    const counts = TIERS.flatMap(([name, color]) => {
      const n = session[`orc:tier-${name}`] ?? 0

      return n > 0 ? [{ name, color, n }] : []
    })
    const row = (
      <Box>
        <Text color="claude" bold>
          ◆ orc
        </Text>
        <Text>{'  '}</Text>
        {counts.length === 0 && <Text dimColor>no handoffs yet</Text>}
        {counts.map(({ name, color, n }, i) => (
          <Text>
            {i > 0 && <Text dimColor> · </Text>}
            <Text color={color}>{name}</Text>
            <Text bold> {n}</Text>
          </Text>
        ))}
        {running.length > 0 && (
          <Text color="claude">
            {'  '}● {running.length} running
          </Text>
        )}
      </Box>
    )

    if (!isOpen) return row

    // The newest lines, as many as fit; the tree never crowds out the prompt.
    const all = lines(agents)
    const room = Math.max(1, Math.min(LINES, e.props.maxRows - 2))
    const shown = all.slice(-room)
    const width = Math.max(20, e.props.bodyColumns)

    return (
      <Box flexDirection="column">
        {row}
        {all.length === 0 && <Text dimColor>  no agents yet</Text>}
        {all.length > shown.length && (
          <Text dimColor>  … {all.length - shown.length} earlier</Text>
        )}
        {shown.map(({ agent, branch }) => {
          const [mark, markColor] = MARK[agent.state]
          const name = short(agent.type)
          const time = agent.seconds === undefined ? '' : `  ${agent.seconds}s`
          const used = 2 + branch.length + 3 + name.length + 2 + time.length
          const label = agent.label.slice(0, Math.max(0, width - used))

          return (
            <Text>
              <Text dimColor>  {branch} </Text>
              <Text color={markColor}>{mark} </Text>
              <Text color={colorOf(agent.type)}>{name}</Text>
              <Text dimColor={agent.state !== 'running'}>  {label}</Text>
              <Text dimColor>{time}</Text>
            </Text>
          )
        })}
      </Box>
    )
  })
}
