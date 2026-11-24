import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { Ledger } from '../types'

const EMPTY: Ledger = { turn: [], session: {}, running: [] }
const ORCHESTRATOR = 'orc:orchestrator'
const SKILLS = new Set(['orc', 'orc:orc'])
const TIER = /^orc:tier-/
// "orc on" or "orc off" as the whole prompt, so the words inside a sentence, a
// question or pasted text can never switch the row by accident.
const SWITCH = /^\s*orc (on|off)\s*[.!]?\s*$/i
// Where a prompt is the person's own: typed here, from their other device, or
// handed in by the program driving the session. Never a notification or a peer.
const PERSON = new Set(['composer', 'bridge', 'sdk'])

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

const isOn = atom({ plugin: 'orc-ledger', key: 'isOn' } as const, false)
const ledger = atom({ plugin: 'orc-ledger', key: 'ledger' } as const, EMPTY, {
  shape: 'ledger-3',
})

const short = (tier: string) => tier.replace('orc:tier-', '')

const isOrchestrator = async ($: EngineInterface) =>
  (await $.session.info()).agentType === ORCHESTRATOR

// This mod only watches: every hook passes the event on unchanged, and one
// that fails is skipped, so orc behaves the same with or without it.
export const register: Register = on => {
  // Launched as the orchestrator, routing is on from the first turn.
  on('session.start', async ($, e, next) => {
    if (await isOrchestrator($)) await update($, isOn, () => true)

    return next(e)
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
  // has really started: a refused or failed dispatch never gets an id.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const tier = e.subagentType
    const id = started.agentId
    const isHandoff =
      e.parentAgentId === undefined &&
      e.workflow === undefined &&
      // A teammate never reports back here, so it could never stop running.
      e.isTeammate !== true &&
      TIER.test(tier) &&
      id !== undefined

    if (!isHandoff) return started

    // A tier dispatch means routing is on, however it was turned on.
    await update($, isOn, () => true)
    await update($, ledger, l => ({
      // A resumed agent is running again, and is the handoff it already was.
      turn: e.resume ? l.turn : [...l.turn, { tier, model: e.model }],
      session: e.resume
        ? l.session
        : { ...l.session, [tier]: (l.session[tier] ?? 0) + 1 },
      running: [...l.running.filter(one => one !== id), id],
    }))

    return started
  }).catch(($, e, next) => next(e))

  // An agent that reports back is no longer running; matched by id, so a
  // second report of the same agent changes nothing.
  on('agent.report', async ($, e, next) => {
    await update($, ledger, l =>
      l.running.includes(e.agentId)
        ? { ...l, running: l.running.filter(one => one !== e.agentId) }
        : l,
    )

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
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOn))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const { session, running } = await read($, ledger)
    const counts = TIERS.flatMap(([name, color]) => {
      const n = session[`orc:tier-${name}`] ?? 0

      return n > 0 ? [{ name, color, n }] : []
    })

    return (
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
  })
}
