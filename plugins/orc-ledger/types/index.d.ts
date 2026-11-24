export type Handoff = { tier: string; model?: string }

export type Ledger = {
  /** Handoffs started from the main conversation in the current turn. */
  turn: Handoff[]
  /** Handoffs per tier across the session. */
  session: Record<string, number>
  /** Ids of the tier agents started from the main conversation and not yet back. */
  running: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'orc-ledger': { isOn: boolean; ledger: Shaped<Ledger> }
  }
}
