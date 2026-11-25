import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { Ledger, TreeAgent } from '../types'

const EMPTY: Ledger = {
  turn: [],
  session: {},
  running: [],
  agents: [],
  workflows: {},
}
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
// The name a workflow script gives itself in its `meta` block.
const META_NAME = /\bname:\s*['"`]([^'"`\n]{1,60})['"`]/
// The tree keeps this many agents and draws at most this many lines.
const KEPT = 80
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

type Line = {
  branch: string
  state: TreeAgent['state']
  name: string
  color?: Color
  label: string
  time: string
}

const isOn = atom({ plugin: 'orc-ledger', key: 'isOn' } as const, false)
const isTreeOpen = atom(
  { plugin: 'orc-ledger', key: 'isTreeOpen' } as const,
  false,
)
const ledger = atom({ plugin: 'orc-ledger', key: 'ledger' } as const, EMPTY, {
  shape: 'ledger-5',
})

const short = (type: string) => type.replace('orc:tier-', '')

const colorOf = (type: string): Color | undefined =>
  TIERS.find(([name]) => `orc:tier-${name}` === type)?.[1]

const isOrchestrator = async ($: EngineInterface) =>
  (await $.session.info()).agentType === ORCHESTRATOR

/** How long something took, in the largest two units: `8s`, `3m 47s`, `1h 2m`. */
const took = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`

  return `${s}s`
}

/** Handoffs per tier, cheapest first: `cheap 2, strong 1`. */
const tally = (tiers: readonly string[]) =>
  TIERS.flatMap(([name]) => {
    const n = tiers.filter(tier => tier === `orc:tier-${name}`).length

    return n > 0 ? [`${name} ${n}`] : []
  }).join(', ')

/**
 * The tree's lines, parents before their children, with the branch drawn.
 * A workflow is one line saying how many of its stages are back, with only
 * the stages still out (or failed) under it, so a run of twenty stays short.
 */
const lines = (l: Ledger) => {
  const { agents } = l
  const known = new Set(agents.map(one => one.id))
  const out: Line[] = []
  const lineOf = (agent: TreeAgent, branch: string): Line => ({
    branch,
    state: agent.state,
    name: short(agent.type),
    color: colorOf(agent.type),
    label: agent.label,
    time: agent.seconds === undefined ? '' : took(agent.seconds),
  })
  const walk = (parent: string, indent: string) => {
    const children = agents.filter(one => one.parent === parent)
    children.forEach((agent, i) => {
      const isLast = i === children.length - 1
      out.push(lineOf(agent, `${indent}${isLast ? '└─' : '├─'}`))
      walk(agent.id, `${indent}${isLast ? '   ' : '│  '}`)
    })
  }
  // The top level, in the order things started: an agent of its own, or a
  // workflow run standing for all of its stages.
  const tops: (TreeAgent | string)[] = []
  for (const agent of agents) {
    const isTop = agent.parent === undefined || !known.has(agent.parent)
    if (!isTop) continue
    if (agent.run === undefined) tops.push(agent)
    else if (!tops.includes(agent.run)) tops.push(agent.run)
  }
  tops.forEach((top, i) => {
    const isLast = i === tops.length - 1
    const branch = isLast ? '└─' : '├─'
    const indent = isLast ? '   ' : '│  '
    if (typeof top !== 'string') {
      out.push(lineOf(top, branch))
      walk(top.id, indent)

      return
    }
    const stages = agents.filter(one => one.run === top)
    const out_ = stages.filter(one => one.state !== 'done')
    const isRunning = stages.some(one => one.state === 'running')
    const hasFailed = stages.some(one => one.state === 'failed')
    out.push({
      branch,
      state: isRunning ? 'running' : hasFailed ? 'failed' : 'done',
      name: 'workflow',
      label: l.workflows[top] ?? '',
      time: `${stages.length - out_.length} of ${stages.length} back`,
    })
    out_.forEach((agent, j) => {
      const isLastStage = j === out_.length - 1
      out.push(lineOf(agent, `${indent}${isLastStage ? '└─' : '├─'}`))
      walk(agent.id, `${indent}${isLastStage ? '   ' : '│  '}`)
    })
  })

  return out
}

/** Marks one agent back, once: a second word about it changes nothing. */
const back = async ($: EngineInterface, id: string, state: 'done' | 'failed') => {
  const now = await $.clock.now()
  await update($, ledger, l => ({
    ...l,
    running: l.running.filter(one => one !== id),
    agents: l.agents.map(one =>
      one.id === id && one.state === 'running'
        ? {
            ...one,
            state,
            seconds: Math.max(0, Math.round((now - one.startedAt) / 1000)),
          }
        : one,
    ),
  }))
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

  // A workflow's stages name the tool call that started the run, so its name
  // is kept under that call until the first stage says which run it is.
  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const name = META_NAME.exec(e.script ?? '')?.[1] ?? e.name ?? 'workflow'
    await update($, ledger, l => ({
      ...l,
      workflows: { ...l.workflows, [e.tool_use_id]: name },
    }))

    return next(e)
  }).catch(($, e, next) => next(e))

  // A tier agent the main conversation starts, by itself or as a workflow's
  // stage, is one handoff, counted once it has really started: a refused or
  // failed dispatch never gets an id. The tree also takes whatever a tier
  // agent in it goes on to start.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const type = e.subagentType
    const id = started.agentId

    // A teammate never says here that it is back, so it could never stop running.
    if (id === undefined || e.isTeammate === true) return started

    const isHandoff = e.parentAgentId === undefined && TIER.test(type)
    const { agents } = await read($, ledger)
    const isChild = agents.some(one => one.id === e.parentAgentId)

    if (!isHandoff && !isChild) return started

    const startedAt = await $.clock.now()
    const run = e.workflow?.runId
    const agent: TreeAgent = {
      id,
      parent: e.parentAgentId,
      run,
      type,
      label: e.description,
      state: 'running',
      startedAt,
    }
    // A tier dispatch means routing is on, however it was turned on.
    if (isHandoff) await update($, isOn, () => true)
    await update($, ledger, l => ({
      // A resumed agent is running again, and is the handoff it already was.
      turn: isHandoff && !e.resume ? [...l.turn, type] : l.turn,
      session:
        isHandoff && !e.resume
          ? { ...l.session, [type]: (l.session[type] ?? 0) + 1 }
          : l.session,
      running: isHandoff ? [...l.running.filter(one => one !== id), id] : l.running,
      agents: [...l.agents.filter(one => one.id !== id), agent].slice(-KEPT),
      workflows:
        run === undefined || l.workflows[run] !== undefined
          ? l.workflows
          : { ...l.workflows, [run]: l.workflows[e.tool_use_id] ?? '' },
    }))

    return started
  }).catch(($, e, next) => next(e))

  // An agent that reports back is no longer running.
  on('agent.report', async ($, e, next) => {
    await back($, e.agentId, e.status === 'completed' ? 'done' : 'failed')

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const { turn, agents } = await read($, ledger)

    if (e.agentId === undefined) {
      // The main conversation's turn: say what it handed off, once.
      if (turn.length > 0) {
        $.ui.toast(`orc handed off: ${tally(turn)}`)
        await update($, ledger, l => ({ ...l, turn: [] }))
      }
    } else if (agents.some(one => one.id === e.agentId && one.run !== undefined)) {
      // A workflow's stage sends no report: its own turn ending is all there is.
      await back($, e.agentId, e.reason === 'answer' ? 'done' : 'failed')
    }

    return next(e)
  })

  // One row above the prompt:  ◆ orc  cheap 3 · fast 1  ● 1 running
  // and, while `/orc-tree` has it open, the tree of agents under it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOn))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const l = await read($, ledger)
    const isOpen = await read($, isTreeOpen)
    const counts = TIERS.flatMap(([name, color]) => {
      const n = l.session[`orc:tier-${name}`] ?? 0

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
        {l.running.length > 0 && (
          <Text color="claude">
            {'  '}● {l.running.length} running
          </Text>
        )}
      </Box>
    )

    if (!isOpen) return row

    // The newest lines, as many as fit; the tree never crowds out the prompt.
    const all = lines(l)
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
        {shown.map(({ branch, state, name, color, label, time }) => {
          const [mark, markColor] = MARK[state]
          const used = 2 + branch.length + 3 + name.length + 2 + 2 + time.length
          const text = label.slice(0, Math.max(0, width - used))

          return (
            <Text>
              <Text dimColor>  {branch} </Text>
              <Text color={markColor}>{mark} </Text>
              <Text color={color} bold={color === undefined}>
                {name}
              </Text>
              {text !== '' && <Text dimColor={state !== 'running'}>  {text}</Text>}
              {time !== '' && <Text dimColor>  {time}</Text>}
            </Text>
          )
        })}
      </Box>
    )
  })
}
