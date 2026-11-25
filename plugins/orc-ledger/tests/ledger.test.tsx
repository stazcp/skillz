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
const RUN = { origin: { kind: 'composer' }, presentation: {} as never } as const
type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

test('the row shows what is out right now, per tier', async ($, on) => {
  const toasts: string[] = []
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
  expect(await row()).toBe('◆ orc idle')

  // Tier agents the main conversation starts are out, cheapest first:
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

  // An agent reporting back leaves the row, once, whoever else reports.
  await $.agent.report({ ...REPORT, agentId: 'a2' })
  await $.agent.report({ ...REPORT, agentId: 'a2' })
  await $.agent.report({ ...REPORT, agentId: 'zz' })
  expect(await row()).toBe('◆ orc cheap 1 · fast 1 ● 2 running')

  // A resumed agent is out again.
  await $.agent.spawn({ ...SPAWN, resume: { agentId: 'a2' } as never })
  expect(await row()).toBe('◆ orc cheap 2 · fast 1 ● 3 running')
  for (const agentId of ['a1', 'a2', 'a3']) {
    await $.agent.report({ ...REPORT, agentId })
  }
  expect(await row()).toBe('◆ orc idle')

  // A tier agent's own turn ending says nothing; the main turn's end does,
  // and the resumed agent was one handoff, not two.
  await $.turn.complete({ ...TURN, agentId: 'a1' })
  expect(toasts).toEqual([])
  await $.turn.complete(TURN)
  expect(toasts).toEqual(['orc handed off: cheap 2, fast 1'])

  // Only "orc off" as the whole prompt hides the row.
  for (const text of [
    'is orc off by default?',
    'Actually, orc off: no handoffs today.',
    'In the docs it says:\norc off\nwhat is that',
  ]) {
    await say(text)
    expect(await row()).toBe('◆ orc idle')
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
  expect(await row()).toBe('◆ orc idle')

  // A turn with no handoff says nothing.
  await $.turn.complete(TURN)
  expect(toasts.length).toBe(1)

  // /clear and a resume start over: off in a plain session, on and empty as
  // the orchestrator.
  const end = { sessionId: 's1', resume: {} as never }
  await $.agent.spawn(SPAWN)
  await $.session.end({ ...end, reason: 'clear' })
  expect(await row()).toBe('')
  await say('orc on')
  await $.agent.spawn(SPAWN)
  await $.session.end({ ...end, reason: 'resume' })
  expect(await row()).toBe('')
  agentType = 'orc:orchestrator'
  await $.agent.spawn(SPAWN)
  await $.session.end({ ...end, reason: 'clear' })
  expect(await row()).toBe('◆ orc idle')
})

test('/orc-tree shows the agents that are out as a tree, and hides it', async ($, on) => {
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

    return text.replace(/\s+/g, ' ').trim()
  }
  const tree = () => $.command.run({ command: 'orc-tree', args: '', ...RUN })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.skill.prompt({ skill: 'orc', text: 'rules' })

  // Hidden until asked for; open with nothing out, the row is all there is.
  expect(await band()).toBe('◆ orc idle')
  expect((await tree()).text).toBe('orc tree shown. No handoffs yet.')
  expect(await band()).toBe('◆ orc idle')

  // A wide tier and what it fans out to, and a second handoff.
  await $.agent.spawn({ ...SPAWN, subagentType: 'orc:tier-strong-wide', description: 'Fix the flaky test' }) // a1
  await $.agent.spawn({ ...SPAWN, parentAgentId: 'a1', description: 'Find callers' }) // a2
  await $.agent.spawn({ ...SPAWN, parentAgentId: 'a1', subagentType: 'Explore', description: 'Search logs' }) // a3
  await $.agent.spawn({ ...SPAWN, subagentType: 'orc:tier-fast', description: 'Rename the flag' }) // a4
  // Another plugin's agent the main conversation starts is not orc's.
  await $.agent.spawn({ ...SPAWN, subagentType: 'Explore', description: 'Unrelated' })

  // Only the handoffs count in the row; the fan-out is in the tree alone.
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    expect(await band(surface)).toBe(
      [
        '◆ orc fast 1 · strong-wide 1 ● 2 running',
        '├─ ▶ strong-wide Fix the flaky test',
        '│ ├─ ▶ cheap Find callers',
        '│ └─ ▶ Explore Search logs',
        '└─ ▶ fast Rename the flag',
      ].join(' '),
    )
  }

  // An agent that is back, finished or failed, leaves the tree.
  await $.agent.report({ ...REPORT, agentId: 'a2' })
  await $.agent.report({ ...REPORT, agentId: 'a4', status: 'failed' })
  expect(await band()).toBe(
    [
      '◆ orc strong-wide 1 ● 1 running',
      '└─ ▶ strong-wide Fix the flaky test',
      '└─ ▶ Explore Search logs',
    ].join(' '),
  )

  // The same command hides it again, and its answer has the session's totals.
  expect((await tree()).text).toBe(
    'orc tree hidden. Handoffs so far: fast 1, strong-wide 1.',
  )
  expect(await band()).toBe('◆ orc strong-wide 1 ● 1 running')
})

test('a long tree is cut and says how many more are out', async ($, on) => {
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
  expect((await ui.find({ type: 'Text', text: /more/ }))?.text).toMatch(/… 7 more/)
  expect(await ui.find({ type: 'Text', text: /task 8$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /task 9$/ })).toBeUndefined()
  await ui.unmount()
})

test('a workflow is one line with its stages still out under it', async ($, on) => {
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

  // Every stage is a handoff on its tier, and out until its turn ends.
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

  // A stage sends no report: its own turn ending, however it ended, is what
  // marks it back. It leaves the list and is counted on the workflow's line.
  await $.turn.complete({ ...TURN, agentId: 'a1' })
  await $.turn.complete({ ...TURN, agentId: 'a2', reason: 'error' })
  expect(await band()).toBe(
    [
      '◆ orc cheap 1 · max 1 ● 2 running',
      '├─ ▶ workflow triage-open-issues 2 of 3 back',
      '│ └─ ▶ max refute #332',
      '└─ ▶ cheap Count the tests',
    ].join(' '),
  )

  // An agent of its own is not marked back by its turn ending, only its report.
  await $.turn.complete({ ...TURN, agentId: 'a4' })
  expect(await band()).toMatch(/● 2 running/)

  // With every stage back the workflow is gone from the tree.
  await $.turn.complete({ ...TURN, agentId: 'a3' })
  expect(await band()).toBe('◆ orc cheap 1 ● 1 running └─ ▶ cheap Count the tests')

  // The main turn's note groups the handoffs by tier.
  await $.turn.complete(TURN)
  expect(toasts).toEqual(['orc handed off: cheap 1, strong 2, max 1'])
})

test('a swarm stays a few lines: counts per tier, stages summed', async ($, on) => {
  let next = 0
  on('command.register', () => ({ value: { command: 'orc-tree' } }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.spawn', () => ({ model: 'm', agentId: `a${(next += 1)}` }))

  const band = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const text = (await ui.find({ type: 'Box' }))?.text ?? ''
    await ui.unmount()

    return text.replace(/\s+/g, ' ').trim()
  }

  await $.skill.prompt({ skill: 'orc', text: 'rules' })
  await $.command.run({ command: 'orc-tree', args: '', ...RUN })
  await $.tool.call({
    tool: 'Workflow',
    tool_use_id: 'w1',
    script: "export const meta = { name: 'sweep-300-files' }",
  })

  // 300 stages out at once: every one is counted, none is dropped.
  for (let i = 1; i <= 300; i += 1) {
    await $.agent.spawn({
      ...SPAWN,
      tool_use_id: 'w1',
      subagentType: i <= 200 ? 'orc:tier-fast' : 'orc:tier-max',
      description: `file ${i}`,
      workflow: { runId: 'wf_9', agentIndex: i },
    })
  }
  expect(await band()).toBe(
    [
      '◆ orc fast 200 · max 100 ● 300 running',
      '└─ ▶ workflow sweep-300-files 0 of 300 back',
      '└─ ▶ fast 200 · max 100 running',
    ].join(' '),
  )

  // As they come back the counts fall and the workflow's line keeps score.
  for (let i = 1; i <= 297; i += 1) {
    await $.turn.complete({ ...TURN, agentId: `a${i}` })
  }
  expect(await band()).toBe(
    [
      '◆ orc max 3 ● 3 running',
      '└─ ▶ workflow sweep-300-files 297 of 300 back',
      '├─ ▶ max file 298',
      '├─ ▶ max file 299',
      '└─ ▶ max file 300',
    ].join(' '),
  )
})
