import type { Machine, Tagged } from "./index.ts"

export type Trace<S extends Tagged, E extends Tagged> = ReadonlyArray<{
  readonly event: E
  readonly state: S
}>

/**
 * `verified`: the search checked every state the events can reach, and every invariant held;
 * `unreached` lists the tags none of them reach, and `stuck` the tags of reached states that list
 * a way out in `to` but that every sample event leaves as they are. `partial`: no invariant broke,
 * but `depth` cut the search off with states left to check. `broken`: the shortest trace that
 * breaks `invariant`.
 */
export type Report<S extends Tagged, E extends Tagged> =
  | {
      readonly _tag: "verified"
      readonly states: number
      readonly unreached: ReadonlyArray<S["_tag"]>
      readonly stuck: ReadonlyArray<S["_tag"]>
    }
  | { readonly _tag: "partial"; readonly states: number; readonly depth: number }
  | {
      readonly _tag: "broken"
      readonly invariant: string
      readonly initial: S
      readonly trace: Trace<S, E>
    }

// Sorted keys, so `{ _tag, n }` and `{ n, _tag }` are one state.
const json = (state: unknown) =>
  JSON.stringify(state, (_, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).toSorted(([a], [b]) => (a < b ? -1 : 1)))
      : value,
  )

/**
 * Sends every one of `events` in every state the machine can reach from `machine.initial`,
 * breadth first, so a broken invariant comes with its shortest trace. Each event may arrive in
 * any state, as it can from a network. States are compared by `key`, JSON with sorted keys by
 * default, so keep them plain data.
 */
export const verify = <S extends Tagged, E extends Tagged>(
  fsm: Machine<S, E>,
  {
    events,
    invariants = {},
    depth = 12,
    key = json,
  }: {
    // Infer `E` from the machine alone, so inline events keep their literal tags.
    readonly events: ReadonlyArray<NoInfer<E>>
    readonly invariants?: Readonly<Record<string, (state: S) => boolean>>
    readonly depth?: number
    readonly key?: (state: S) => string
  },
): Report<S, E> => {
  const broken = (state: S) => Object.keys(invariants).find((name) => !invariants[name]!(state))
  const initial = fsm.initial
  const first = broken(initial)
  if (first !== undefined) return { _tag: "broken", invariant: first, initial, trace: [] }

  const seen = new Map([[key(initial), initial]])
  const next = (state: S) =>
    events.flatMap((event) => {
      const step = fsm.transition(state, event)
      return step._tag === "ignored" || seen.has(key(step.state))
        ? []
        : [{ event, state: step.state }]
    })

  let frontier: Array<{ readonly state: S; readonly trace: Trace<S, E> }> = [
    { state: initial, trace: [] },
  ]
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const found: typeof frontier = []
    for (const { state, trace } of frontier) {
      for (const move of next(state)) {
        // Two events can lead to the same new state.
        if (seen.has(key(move.state))) continue
        seen.set(key(move.state), move.state)
        const path = [...trace, move]
        const invariant = broken(move.state)
        if (invariant !== undefined) return { _tag: "broken", invariant, initial, trace: path }
        found.push({ state: move.state, trace: path })
      }
    }
    frontier = found
  }

  // States left at `depth` with nowhere new to go still finish the search.
  if (frontier.some(({ state }) => next(state).length > 0)) {
    return { _tag: "partial", states: seen.size, depth }
  }
  const reached = new Set([...seen.values()].map((state) => state._tag))
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const tags = Object.keys(fsm.graph) as Array<S["_tag"]>
  // A state that may move on but that no sample event changes, such as `loading` with no `resolve`.
  const stuck = [...seen.values()].filter(
    (state) =>
      fsm.graph[state._tag as S["_tag"]].length > 0 &&
      events.every((event) => {
        const step = fsm.transition(state, event)
        return step._tag === "ignored" || key(step.state) === key(state)
      }),
  )
  return {
    _tag: "verified",
    states: seen.size,
    unreached: tags.filter((tag) => !reached.has(tag)),
    stuck: [...new Set(stuck.map((state) => state._tag))],
  }
}
