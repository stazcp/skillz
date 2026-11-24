export type Handoff = { tier: string; model?: string }

/** One agent in the tree: a tier agent, or anything a tier agent started. */
export type TreeAgent = {
  id: string
  /** The agent that started it; absent when the main conversation did. */
  parent?: string
  /** Its agent type, as dispatched (`orc:tier-cheap`, `Explore`). */
  type: string
  /** The dispatch's short description of the task. */
  label: string
  state: 'running' | 'done' | 'failed'
  startedAt: number
  /** Whole seconds it ran for, once it has reported back. */
  seconds?: number
}

export type Ledger = {
  /** Handoffs started from the main conversation in the current turn. */
  turn: Handoff[]
  /** Handoffs per tier across the session. */
  session: Record<string, number>
  /** Ids of the tier agents started from the main conversation and not yet back. */
  running: string[]
  /** The most recent agents, oldest first, for the tree. */
  agents: TreeAgent[]
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
