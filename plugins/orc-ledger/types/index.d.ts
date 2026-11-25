/** One agent that is out: a tier agent, or anything a tier agent started. */
export type TreeAgent = {
  id: string
  /** The agent that started it; absent when the main conversation did. */
  parent?: string
  /** The workflow run it is a stage of, when it is one. */
  run?: string
  /** Its agent type, as dispatched (`orc:tier-cheap`, `Explore`). */
  type: string
  /** The dispatch's short description of the task. */
  label: string
}

/** One workflow run: its name and how many of its stages have started and come back. */
export type Run = { name: string; started: number; back: number }

export type Ledger = {
  /** Tiers of the handoffs started from the main conversation this turn. */
  turn: string[]
  /** Handoffs per tier across the session. */
  session: Record<string, number>
  /** The agents out right now, oldest first; one leaves when it is back. */
  agents: TreeAgent[]
  /** Workflow names by the tool call that started one, until a stage names the run. */
  names: Record<string, string>
  /** The workflow runs seen, by run id. */
  runs: Record<string, Run>
}

declare module 'claude-code' {
  interface PluginState {
    'orc-ledger': {
      isOn: boolean
      isTreeOpen: boolean
      ledger: Shaped<Ledger>
    }
  }
}
