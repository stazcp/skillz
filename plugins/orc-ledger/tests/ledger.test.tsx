import { expect, test } from 'claude-code/testing'

const SPAWN = {
  tool_use_id: 't1',
  prompt: 'Find callers.',
  description: 'x',
  subagentType: 'orc:tier-cheap',
  provider: { plugin: 'orc', tier: 'user' },
  parentModel: 'opus',
  background: true,
  fork: false,
} as const
const TURN = {
  answer: 'done',
  durationMs: 1,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
} as const
const TYPED = { wait: false, origin: { kind: 'composer' } } as const
const REPORT = {
  agentId: 'a1',
  subagentType: 'orc:tier-cheap',
  provider: { plugin: 'orc', tier: 'user' },
  status: 'completed',
  text: 'done',
} as const
const BAND = {
  plugin: 'orc-ledger',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const
type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

test('the row follows orc and counts handoffs per tier', async ($, on) => {
  const toasts: string[] = []
  let agentType: string | undefined
  let next = 0
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('session.info', () => ({ value: { agentType } as never }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.report', (_, e) => ({ text: e.text, review: 'none' as never }))
  // Stands for the engine: a bogus type is refused, a resume keeps its id.
  on('agent.spawn', (_, e) =>
    e.subagentType === 'orc:tier-bogus'
      ? { deny: 'no such agent' }
      : { model: 'm', agentId: e.resume?.agentId ?? `a${(next += 1)}` },
  )
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  // What the row reads as on a surface: its texts joined, or '' when not drawn.
  const row = async (surface: Surface = 'terminal') => {
    const ui = await $.ui.mount({ ...BAND, surface })
    const text = (await ui.find({ type: 'Box' }))?.text ?? ''
    await ui.unmount()

    return text.replace(/\s+/g, ' ').trim()
  }
  const say = (text: string) => $.prompt.submit({ text, ...TYPED })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await row()).toBe('')

  // The orc skill loading turns the row on.
  await $.skill.prompt({ skill: 'orc:orc', text: 'rules' })
  expect(await row()).toBe('◆ orc no handoffs yet')

  // Tier agents the main conversation starts are counted, cheapest first:
  // not another plugin's agent, a tier agent's own child, a refused one, a
  // teammate or a workflow stage.
  await $.agent.spawn({ ...SPAWN, subagentType: 'orc:tier-fast', model: 'opus' }) // a1
  await $.agent.spawn(SPAWN) // a2
  await $.agent.spawn(SPAWN) // a3
  await $.agent.spawn({ ...SPAWN, subagentType: 'Explore' })
  await $.agent.spawn({ ...SPAWN, parentAgentId: 'a1' })
  await $.agent.spawn({ ...SPAWN, subagentType: 'orc:tier-bogus' })
  await $.agent.spawn({ ...SPAWN, isTeammate: true })
  await $.agent.spawn({ ...SPAWN, workflow: { runId: 'wf_1', agentIndex: 1 } })
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    expect(await row(surface)).toBe('◆ orc cheap 2 · fast 1 ● 3 running')
  }

  // A prompt folded into the running turn does not lose the turn's handoffs.
  await say('and check the tests too')

  // An agent reporting back stops running, once, whoever else reports.
  await $.agent.report({ ...REPORT, agentId: 'a2' })
  await $.agent.report({ ...REPORT, agentId: 'a2' })
  await $.agent.report({ ...REPORT, agentId: 'zz' })
  expect(await row()).toBe('◆ orc cheap 2 · fast 1 ● 2 running')

  // A resumed agent runs again and is not a new handoff.
  await $.agent.spawn({ ...SPAWN, resume: { agentId: 'a2' } as never })
  expect(await row()).toBe('◆ orc cheap 2 · fast 1 ● 3 running')
  for (const agentId of ['a1', 'a2', 'a3']) {
    await $.agent.report({ ...REPORT, agentId })
  }
  expect(await row()).toBe('◆ orc cheap 2 · fast 1')

  // A tier agent's own turn ending says nothing; the main turn's end does.
  await $.turn.complete({ ...TURN, agentId: 'a1' })
  expect(toasts).toEqual([])
  await $.turn.complete(TURN)
  expect(toasts).toEqual(['orc handed off: fast opus, cheap, cheap'])

  // Only "orc off" as the whole prompt hides the row; the count is kept.
  for (const text of [
    'is orc off by default?',
    'Actually, orc off: no handoffs today.',
    'In the docs it says:\norc off\nwhat is that',
  ]) {
    await say(text)
    expect(await row()).toBe('◆ orc cheap 2 · fast 1')
  }
  await say(' Orc off.\n')
  expect(await row()).toBe('')
  for (const text of ['run orc on this repo', 'Which is the default, orc on?']) {
    await say(text)
    expect(await row()).toBe('')
  }
  // Only the person's own prompt switches it, never a notification's text.
  await $.prompt.submit({
    text: 'orc on',
    wait: false,
    origin: { kind: 'task-notification' } as never,
  })
  expect(await row()).toBe('')
  await say('orc on')
  expect(await row()).toBe('◆ orc cheap 2 · fast 1')

  // A turn with no handoff says nothing.
  await $.turn.complete(TURN)
  expect(toasts.length).toBe(1)

  // /clear and a resume start over: off in a plain session, on and empty as
  // the orchestrator.
  const end = { sessionId: 's1', resume: {} as never }
  await $.session.end({ ...end, reason: 'clear' })
  expect(await row()).toBe('')
  await say('orc on')
  await $.agent.spawn(SPAWN)
  await $.session.end({ ...end, reason: 'resume' })
  expect(await row()).toBe('')
  agentType = 'orc:orchestrator'
  await $.agent.spawn(SPAWN)
  await $.session.end({ ...end, reason: 'clear' })
  expect(await row()).toBe('◆ orc no handoffs yet')
})
