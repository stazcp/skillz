import { expect, mock, test } from 'claude-code/testing'

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
const RUN = { origin: { kind: 'composer' }, presentation: {} as never } as const
type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

test('the row follows orc and counts handoffs per tier', async ($, on) => {
  const toasts: string[] = []
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'orc-tree' } }))
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
  // not another plugin's agent, a tier agent's own child, a refused one or a
  // teammate.
  await $.agent.spawn({ ...SPAWN, subagentType: 'orc:tier-fast', model: 'opus' }) // a1
  await $.agent.spawn(SPAWN) // a2
  await $.agent.spawn(SPAWN) // a3
  await $.agent.spawn({ ...SPAWN, subagentType: 'Explore' })
  await $.agent.spawn({ ...SPAWN, parentAgentId: 'a1' })
  await $.agent.spawn({ ...SPAWN, subagentType: 'orc:tier-bogus' })
  await $.agent.spawn({ ...SPAWN, isTeammate: true })
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
  expect(toasts).toEqual(['orc handed off: cheap 2, fast 1'])

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

test('/orc-tree shows the agents as a tree under the row, and hides it', async ($, on) => {
  const clock = mock.clock(on)
  let next = 0
  on('command.register', () => ({ value: { command: 'orc-tree' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.info', () => ({ value: {} as never }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('agent.report', (_, e) => ({ text: e.text, review: 'none' as never }))
  on('agent.spawn', () => ({ model: 'm', agentId: `a${(next += 1)}` }))

  // Every line the band draws on a surface, top to bottom.
  const band = async (surface: Surface = 'terminal') => {
    const ui = await $.ui.mount({ ...BAND, surface })
    const text = (await ui.find({ type: 'Box' }))?.text ?? ''
    await ui.unmount()

    return text
  }
  const squash = (text: string) => text.replace(/\s+/g, ' ').trim()
  const tree = () => $.command.run({ command: 'orc-tree', args: '', ...RUN })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.skill.prompt({ skill: 'orc', text: 'rules' })

  // Hidden until asked for; open and empty says so.
  expect(squash(await band())).toBe('◆ orc no handoffs yet')
  expect((await tree()).text).toBe('orc tree shown.')
  expect(squash(await band())).toBe('◆ orc no handoffs yet no agents yet')

  // A wide tier and what it fans out to, a second handoff, and one that fails.
  await $.agent.spawn({ ...SPAWN, subagentType: 'orc:tier-strong-wide', description: 'Fix the flaky test' }) // a1
  await $.agent.spawn({ ...SPAWN, parentAgentId: 'a1', description: 'Find callers' }) // a2
  await $.agent.spawn({ ...SPAWN, parentAgentId: 'a1', subagentType: 'Explore', description: 'Search logs' }) // a3
  await $.agent.spawn({ ...SPAWN, subagentType: 'orc:tier-fast', description: 'Rename the flag' }) // a4
  // Another plugin's agent the main conversation starts is not orc's.
  await $.agent.spawn({ ...SPAWN, subagentType: 'Explore', description: 'Unrelated' })
  await clock.advance(19_000)
  await $.agent.report({ ...REPORT, agentId: 'a2' })
  await $.agent.report({ ...REPORT, agentId: 'a4', status: 'failed' })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    expect(squash(await band(surface))).toBe(
      [
        '◆ orc fast 1 · strong-wide 1 ● 1 running',
        '├─ ▶ strong-wide Fix the flaky test',
        '│ ├─ ✔ cheap Find callers 19s',
        '│ └─ ▶ Explore Search logs',
        '└─ ✖ fast Rename the flag 19s',
      ].join(' '),
    )
  }

  // Only the handoffs count in the row; the fan-out is in the tree alone.
  expect(squash(await band())).toMatch(/^◆ orc fast 1 · strong-wide 1 ● 1 running/)

  // Past a minute a duration reads in minutes, and past an hour in hours.
  await clock.advance(208_000)
  await $.agent.report({ ...REPORT, agentId: 'a3' })
  expect(squash(await band())).toMatch(/✔ Explore Search logs 3m 47s/)
  await clock.advance(3_493_000)
  await $.agent.report({ ...REPORT, agentId: 'a1' })
  expect(squash(await band())).toMatch(/✔ strong-wide Fix the flaky test 1h 2m │/)

  // The same command hides it again, and the row is all that is left.
  expect((await tree()).text).toBe('orc tree hidden.')
  expect(squash(await band())).toBe('◆ orc fast 1 · strong-wide 1')
})

test('a long tree shows its newest lines and says how many are above', async ($, on) => {
  mock.clock(on)
  let next = 0
  on('command.register', () => ({ value: { command: 'orc-tree' } }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('agent.spawn', () => ({ model: 'm', agentId: `a${(next += 1)}` }))

  await $.skill.prompt({ skill: 'orc', text: 'rules' })
  await $.command.run({ command: 'orc-tree', args: '', ...RUN })
  for (let i = 1; i <= 15; i += 1) {
    await $.agent.spawn({ ...SPAWN, description: `task ${i}` })
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /earlier/ }))?.text).toMatch(/… 7 earlier/)
  expect(await ui.find({ type: 'Text', text: /task 7$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /task 15/ })).toBeDefined()
  await ui.unmount()
})

test('a workflow is one line with its stages still out under it', async ($, on) => {
  const clock = mock.clock(on)
  const toasts: string[] = []
  let next = 0
  on('command.register', () => ({ value: { command: 'orc-tree' } }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.spawn', () => ({ model: 'm', agentId: `a${(next += 1)}` }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  const band = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const text = (await ui.find({ type: 'Box' }))?.text ?? ''
    await ui.unmount()

    return text.replace(/\s+/g, ' ').trim()
  }
  const stage = (agentIndex: number, subagentType: string, description: string) =>
    $.agent.spawn({
      ...SPAWN,
      tool_use_id: 'w1',
      subagentType,
      description,
      workflow: { runId: 'wf_1', agentIndex },
    })

  await $.skill.prompt({ skill: 'orc', text: 'rules' })
  await $.command.run({ command: 'orc-tree', args: '', ...RUN })

  // The run's name is read from the script the Workflow tool was handed.
  await $.tool.call({
    tool: 'Workflow',
    tool_use_id: 'w1',
    script: "export const meta = { name: 'triage-open-issues', description: 'x' }",
  })
  await stage(1, 'orc:tier-strong', 'investigate #332') // a1
  await stage(2, 'orc:tier-strong', 'investigate #315') // a2
  await stage(3, 'orc:tier-max', 'refute #332') // a3
  await $.agent.spawn({ ...SPAWN, description: 'Count the tests' }) // a4

  // Every stage is a handoff on its tier, and running until its turn ends.
  expect(await band()).toBe(
    [
      '◆ orc cheap 1 · strong 2 · max 1 ● 4 running',
      '├─ ▶ workflow triage-open-issues 0 of 3 back',
      '│ ├─ ▶ strong investigate #332',
      '│ ├─ ▶ strong investigate #315',
      '│ └─ ▶ max refute #332',
      '└─ ▶ cheap Count the tests',
    ].join(' '),
  )

  // A stage sends no report: its own turn ending is what marks it back. A
  // finished stage leaves the list and is counted on the workflow's line.
  await clock.advance(30_000)
  await $.turn.complete({ ...TURN, agentId: 'a1' })
  await $.turn.complete({ ...TURN, agentId: 'a2', reason: 'error' })
  expect(await band()).toBe(
    [
      '◆ orc cheap 1 · strong 2 · max 1 ● 2 running',
      '├─ ▶ workflow triage-open-issues 1 of 3 back',
      '│ ├─ ✖ strong investigate #315 30s',
      '│ └─ ▶ max refute #332',
      '└─ ▶ cheap Count the tests',
    ].join(' '),
  )

  // An agent of its own is not marked back by its turn ending, only its report.
  await $.turn.complete({ ...TURN, agentId: 'a4' })
  expect(await band()).toMatch(/● 2 running/)

  // With every stage back the workflow's line stands alone.
  await $.turn.complete({ ...TURN, agentId: 'a3' })
  expect(await band()).toMatch(/├─ ✖ workflow triage-open-issues 2 of 3 back │ └─ ✖ strong/)

  // The main turn's note groups the handoffs by tier.
  await $.turn.complete(TURN)
  expect(toasts).toEqual(['orc handed off: cheap 1, strong 2, max 1'])
})
