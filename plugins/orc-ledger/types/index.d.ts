/** One agent orc knows about: a tier agent, or anything a tier agent started. */
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
  isRunning: boolean
}

export type Ledger = {
  /** Tiers of the handoffs started from the main conversation this turn. */
  turn: string[]
  /** Handoffs per tier across the session. */
  session: Record<string, number>
  /** The most recent agents, oldest first; the row and tree show the running ones. */
  agents: TreeAgent[]
  /** Workflow names: by the tool call that started one, then by its run. */
  workflows: Record<string, string>
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
