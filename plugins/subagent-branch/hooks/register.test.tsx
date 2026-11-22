import { expect, test } from 'claude-code/testing'
import type { RenderPropsOf } from 'claude-code'

const PROPS: RenderPropsOf['AgentRow'] = {
  id: 'a1',
  description: 'run tests',
  type: 'general-purpose',
  status: 'running',
  name: 'tests',
  kind: 'local_agent',
  taskStatus: 'running',
  label: 'run tests',
  startTime: 0,
  cwd: '/repo',
  tokenCount: 12345,
  tokenSamples: [],
  hasRow: true,
  rowIds: ['a1'],
  isHidden: false,
}

const row = (cwd: string) => ({
  plugin: 'subagent-branch',
  component: 'AgentRow',
  requestId: cwd,
  props: { ...PROPS, cwd },
} as const)

test('prefixes the branch, and keeps the default row without one', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  on('process.run', (_, e) => {
    const cwd = e.argv[2]
    const stdout = cwd === '/repo' ? 'feature/a-very-long-branch-name-here\n' : cwd === '/detached' ? '\n' : ''
    return { value: { exitCode: cwd === '/nope' ? 128 : 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // Stands for the engine: records the body a hook passed (escapes and all;
  // a Text may not hold them), else draws its own row.
  let body: string | undefined
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    body = e.component === 'AgentRow' ? e.props.body : undefined
    return <Text>{body === undefined ? 'default' : 'body'}</Text>
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...row('/repo'), surface })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('body')
    expect(body).toBe('\x1b[36mfeature/a-very-long-bra…\x1b[0m tests · run tests · 12k')
    await ui.unmount()

    for (const cwd of ['/nope', '/detached']) {
      const d = await $.ui.mount({ ...row(cwd), surface })
      expect((await d.find({ type: 'Text' }))?.text).toBe('default')
      await d.unmount()
    }
  }
})
