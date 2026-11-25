import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { Ledger, TreeAgent } from '../types'

const EMPTY: Ledger = { turn: [], session: {}, agents: [], names: {}, runs: {} }
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
// The most lines the tree draws, and the most stages a workflow lists one by
// one before it sums them per tier instead.
const LINES = 12
const LISTED = 5
// Bounds on what is remembered, so a session of any length stays small. Only
// agents that are out are kept, so the first is a guard, not a working limit.
const AGENTS = 2000
const RUNS = 50

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

type Line = { branch: string; name: string; color?: Color; label: string; note: string }

const isOn = atom({ plugin: 'orc-ledger', key: 'isOn' } as const, false)
const isTreeOpen = atom(
  { plugin: 'orc-ledger', key: 'isTreeOpen' } as const,
  false,
)
const ledger = atom({ plugin: 'orc-ledger', key: 'ledger' } as const, EMPTY, {
  shape: 'ledger-7',
})

const short = (type: string) => type.replace('orc:tier-', '')

const colorOf = (type: string): Color | undefined =>
  TIERS.find(([name]) => `orc:tier-${name}` === type)?.[1]

const isOrchestrator = async ($: EngineInterface) =>
  (await $.session.info()).agentType === ORCHESTRATOR

/** Handoffs per tier, cheapest first: `cheap 2, strong 1`. */
const tally = (tiers: readonly string[]) =>
  TIERS.flatMap(([name]) => {
    const n = tiers.filter(tier => tier === `orc:tier-${name}`).length

    return n > 0 ? [`${name} ${n}`] : []
  }).join(', ')

/** The handoffs still out: tier agents the main conversation started. */
const out = (l: Ledger) =>
  l.agents.filter(one => one.parent === undefined && TIER.test(one.type))

/** Agents per type in the order first seen: `strong 60 · max 40`. */
const perType = (agents: readonly TreeAgent[]) => {
  const counts = new Map<string, number>()
  for (const one of agents) {
    counts.set(short(one.type), (counts.get(short(one.type)) ?? 0) + 1)
  }

  return [...counts].map(([name, n]) => `${name} ${n}`).join(' · ')
}

/**
 * The tree's lines: only what is running now, parents before their children,
 * with the branch drawn. A workflow is one line saying how many of its stages
 * are back, with the stages still out under it: one by one while they are
 * few, summed per tier when they are a swarm.
 */
const lines = (l: Ledger) => {
  const running = l.agents
  const known = new Set(running.map(one => one.id))
  const drawn: Line[] = []
  const lineOf = (agent: TreeAgent, branch: string): Line => ({
    branch,
    name: short(agent.type),
    color: colorOf(agent.type),
    label: agent.label,
    note: '',
  })
  const walk = (parent: string, indent: string) => {
    const children = running.filter(one => one.parent === parent)
    children.forEach((agent, i) => {
      const isLast = i === children.length - 1
      drawn.push(lineOf(agent, `${indent}${isLast ? '└─' : '├─'}`))
      walk(agent.id, `${indent}${isLast ? '   ' : '│  '}`)
    })
  }
  // The top level, in the order things started: an agent of its own, or a
  // workflow run standing for all of its stages.
  const tops: (TreeAgent | string)[] = []
  for (const agent of running) {
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
      drawn.push(lineOf(top, branch))
      walk(top.id, indent)

      return
    }
    const left = running.filter(one => one.run === top && one.parent === undefined)
    const run = l.runs[top]
    drawn.push({
      branch,
      name: 'workflow',
      label: run?.name ?? '',
      note: run === undefined ? '' : `${run.back} of ${run.started} back`,
    })
    if (left.length > LISTED) {
      drawn.push({ branch: `${indent}└─`, name: '', label: perType(left), note: 'running' })

      return
    }
    left.forEach((agent, j) => {
      const isLastStage = j === left.length - 1
      drawn.push(lineOf(agent, `${indent}${isLastStage ? '└─' : '├─'}`))
      walk(agent.id, `${indent}${isLastStage ? '   ' : '│  '}`)
    })
  })

  return drawn
}

/** Takes out an agent that is back; a second word about it changes nothing. */
const back = ($: EngineInterface, id: string) =>
  update($, ledger, l => {
    const agent = l.agents.find(one => one.id === id)
    if (agent === undefined) return l
    const run = agent.run === undefined ? undefined : l.runs[agent.run]

    return {
      ...l,
      agents: l.agents.filter(one => one.id !== id),
      runs:
        agent.run === undefined || run === undefined || agent.parent !== undefined
          ? l.runs
          : { ...l.runs, [agent.run]: { ...run, back: run.back + 1 } },
    }
  })

// This mod only watches: every hook passes the event on unchanged, and one
// that fails is skipped, so orc behaves the same with or without it.
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show or hide the tree of agents orc has out right now',
    })
    // Launched as the orchestrator, routing is on from the first turn.
    if (await isOrchestrator($)) await update($, isOn, () => true)

    return next(e)
  })

  // `/orc-tree` shows the tree under the row, and hides it again. Its answer
  // is where the session's totals are, for when the cost picture is wanted.
  on('command.run', { command: COMMAND }, async $ => {
    const isOpen = await update($, isTreeOpen, open => !open)
    const { session } = await read($, ledger)
    const total = tally(
      Object.entries(session).flatMap(([tier, n]) => Array<string>(n).fill(tier)),
    )
    const sofar = total === '' ? 'No handoffs yet' : `Handoffs so far: ${total}`

    return { text: `orc tree ${isOpen ? 'shown' : 'hidden'}. ${sofar}.` }
  })

  // A /clear or a resume puts another conversation in the same process: orc's
  // rules left with the old one unless the session itself runs as the
  // orchestrator, and its agents are not the new one's.
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
      names: Object.fromEntries(
        Object.entries({ ...l.names, [e.tool_use_id]: name }).slice(-RUNS),
      ),
    }))

    return next(e)
  }).catch(($, e, next) => next(e))

  // A tier agent the main conversation starts, by itself or as a workflow's
  // stage, is one handoff, counted once it has really started: a refused or
  // failed dispatch never gets an id. Whatever a tier agent goes on to start
  // is remembered too, for the tree.
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

    const run = e.workflow?.runId
    const agent: TreeAgent = {
      id,
      parent: e.parentAgentId,
      run,
      type,
      label: e.description,
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
      agents: [...l.agents.filter(one => one.id !== id), agent].slice(-AGENTS),
      names: l.names,
      runs:
        run === undefined || !isHandoff || e.resume
          ? l.runs
          : Object.fromEntries(
              Object.entries({
                ...l.runs,
                [run]: {
                  name: l.runs[run]?.name ?? l.names[e.tool_use_id] ?? '',
                  started: (l.runs[run]?.started ?? 0) + 1,
                  back: l.runs[run]?.back ?? 0,
                },
              }).slice(-RUNS),
            ),
    }))

    return started
  }).catch(($, e, next) => next(e))

  // An agent that reports back is no longer running.
  on('agent.report', async ($, e, next) => {
    await back($, e.agentId)

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
      await back($, e.agentId)
    }

    return next(e)
  })

  // One row above the prompt, for what is out right now:
  //   ◆ orc  strong 1 · max 1  ● 2 running        ◆ orc  idle
  // and, while `/orc-tree` has it open, those agents as a tree under it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOn))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const l = await read($, ledger)
    const isOpen = await read($, isTreeOpen)
    const handoffs = out(l)
    const counts = TIERS.flatMap(([name, color]) => {
      const n = handoffs.filter(one => one.type === `orc:tier-${name}`).length

      return n > 0 ? [{ name, color, n }] : []
    })
    const row = (
      <Box>
        <Text color="claude" bold>
          ◆ orc
        </Text>
        <Text>{'  '}</Text>
        {handoffs.length === 0 && <Text dimColor>idle</Text>}
        {counts.map(({ name, color, n }, i) => (
          <Text>
            {i > 0 && <Text dimColor> · </Text>}
            <Text color={color}>{name}</Text>
            <Text bold> {n}</Text>
          </Text>
        ))}
        {handoffs.length > 0 && (
          <Text color="claude">
            {'  '}● {handoffs.length} running
          </Text>
        )}
      </Box>
    )

    if (!isOpen) return row

    // As many lines as fit; the tree never crowds out the prompt.
    const all = lines(l)
    const room = Math.max(1, Math.min(LINES, e.props.maxRows - 2))
    const shown = all.slice(0, room)
    const width = Math.max(20, e.props.bodyColumns)

    return (
      <Box flexDirection="column">
        {row}
        {shown.map(({ branch, name, color, label, note }) => {
          const used = 2 + branch.length + 3 + name.length + 2 + 2 + note.length
          const text = label.slice(0, Math.max(0, width - used))

          return (
            <Text>
              <Text dimColor>  {branch} </Text>
              <Text color="claude">▶ </Text>
              {name !== '' && (
                <Text color={color} bold={color === undefined}>
                  {name}
                  {'  '}
                </Text>
              )}
              {text !== '' && <Text>{text}</Text>}
              {note !== '' && <Text dimColor>  {note}</Text>}
            </Text>
          )
        })}
        {all.length > shown.length && (
          <Text dimColor>  … {all.length - shown.length} more</Text>
        )}
      </Box>
    )
  })
}
