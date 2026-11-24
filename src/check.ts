import type { Machine, Tagged } from "./index.ts"

export type Trace<S extends Tagged, E extends Tagged> = ReadonlyArray<{
  readonly event: E
  readonly state: S
}>

/**
 * `passed`: every state reachable within `depth` holds every invariant; `unreached` lists the
 * tags it never saw. `failed`: the shortest event sequence that breaks `invariant`.
 */
export type Report<S extends Tagged, E extends Tagged> =
  | {
      readonly _tag: "passed"
      readonly states: number
      readonly unreached: ReadonlyArray<S["_tag"]>
    }
  | {
      readonly _tag: "failed"
      readonly invariant: string
      readonly initial: S
      readonly trace: Trace<S, E>
    }

/**
 * Explores every order of `events` from `machine.initial`, breadth first, so a failure comes
 * with its shortest trace. Each event may arrive in any state, as it can from a network.
 * States are compared by `key`, JSON by default, so keep them plain data.
 */
export const check = <S extends Tagged, E extends Tagged>(
  fsm: Machine<S, E>,
  {
    events,
    invariants = {},
    depth = 12,
    key = JSON.stringify,
  }: {
    readonly events: ReadonlyArray<E>
    readonly invariants?: Readonly<Record<string, (state: S) => boolean>>
    readonly depth?: number
    readonly key?: (state: S) => string
  },
): Report<S, E> => {
  const broken = (state: S) => Object.keys(invariants).find((name) => !invariants[name]!(state))
  const initial = fsm.initial
  const first = broken(initial)
  if (first !== undefined) return { _tag: "failed", invariant: first, initial, trace: [] }

  const seen = new Map([[key(initial), initial]])
  let frontier: Array<{ readonly state: S; readonly trace: Trace<S, E> }> = [
    { state: initial, trace: [] },
  ]
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const next: typeof frontier = []
    for (const { state, trace } of frontier) {
      for (const event of events) {
        const step = fsm.transition(state, event)
        if (step._tag === "ignored" || seen.has(key(step.state))) continue
        seen.set(key(step.state), step.state)
        const path = [...trace, { event, state: step.state }]
        const invariant = broken(step.state)
        if (invariant !== undefined) return { _tag: "failed", invariant, initial, trace: path }
        next.push({ state: step.state, trace: path })
      }
    }
    frontier = next
  }

  const reached = new Set([...seen.values()].map((state) => state._tag))
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const tags = Object.keys(fsm.graph) as Array<S["_tag"]>
  return { _tag: "passed", states: seen.size, unreached: tags.filter((tag) => !reached.has(tag)) }
}
