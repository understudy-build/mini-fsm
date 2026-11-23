export type Tagged = { readonly _tag: string }

type Of<U extends Tagged, K extends U["_tag"]> = Extract<U, { readonly _tag: K }>

/** What a state's `enter` effect gets. `signal` aborts when the machine leaves the state value. */
export type Scope<E extends Tagged> = {
  readonly send: (event: E) => void
  readonly signal: AbortSignal
}

/** For each state tag, the other states it may move to. Staying in the same tag is always allowed. */
export type Graph<S extends Tagged> = { readonly [K in S["_tag"]]: ReadonlyArray<S["_tag"]> }

type Node<
  S extends Tagged,
  E extends Tagged,
  K extends S["_tag"],
  To extends ReadonlyArray<S["_tag"]>,
> = {
  /** The other states this one may move to. `[]` marks a final state. */
  readonly to: To
  readonly on?: {
    readonly [T in E["_tag"]]?: (state: Of<S, K>, event: Of<E, T>) => Of<S, K | To[number]>
  }
  readonly enter?: (state: Of<S, K>, scope: Scope<E>) => void | Promise<void>
}

export type Definition<S extends Tagged, E extends Tagged, G extends Graph<S>> = {
  readonly initial: S
  /** Every state tag must appear, so adding a state to the union fails the build until it is handled. */
  readonly states: { readonly [K in keyof G & S["_tag"]]: Node<S, E, K, G[K]> }
}

export type Machine<S extends Tagged, E extends Tagged, G extends Graph<S> = Graph<S>> = {
  readonly initial: S
  readonly graph: G
  /**
   * Pure. Returns the same reference when the current state ignores the event, and throws
   * `IllegalTransition` when a handler returns a state its `to` doesn't list.
   */
  readonly transition: (state: S, event: E) => S
  readonly enter: (state: S, scope: Scope<E>) => void | Promise<void>
}

export type Actor<S extends Tagged, E extends Tagged> = {
  readonly get: () => S
  readonly send: (event: E) => void
  /** Svelte store contract: calls `listener` now, then on every change. */
  readonly subscribe: (listener: (state: S) => void) => () => void
}

/** A handler returned a state its `to` doesn't list. Typed code can't reach it; casts and JavaScript can. */
export class IllegalTransition extends Error {
  readonly _tag = "IllegalTransition"
  readonly from: string
  readonly to: string

  constructor(from: string, to: string) {
    super(`${from} cannot move to ${to}`)
    this.from = from
    this.to = to
  }
}

type Loose<S extends Tagged, E extends Tagged> = {
  readonly to: ReadonlyArray<string>
  readonly on?: Readonly<Record<string, ((state: S, event: E) => S) | undefined>>
  readonly enter?: (state: S, scope: Scope<E>) => void | Promise<void>
}

/**
 * Curried so `State` and `Event` are explicit while the graph is inferred from each `to`:
 * `machine<State, Event>()({ ... })`.
 */
export const machine =
  <S extends Tagged, E extends Tagged>(): (<const G extends Graph<S>>(
    definition: Definition<S, E, G>,
  ) => Machine<S, E, G>) =>
  (definition) => {
    // Lookup by `_tag` guarantees each handler only sees the variants it was typed for.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const states = definition.states as unknown as Readonly<Record<string, Loose<S, E>>>
    const graph = Object.fromEntries(Object.entries(states).map(([tag, node]) => [tag, node.to]))
    return {
      initial: definition.initial,
      // `fromEntries` drops the keys, which are exactly the tags `G` maps.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      graph: graph as never,
      transition: (state, event) => {
        const node = states[state._tag]
        const next = node?.on?.[event._tag]?.(state, event) ?? state
        if (next._tag !== state._tag && !node?.to.includes(next._tag)) {
          throw new IllegalTransition(state._tag, next._tag)
        }
        return next
      },
      enter: (state, scope) => states[state._tag]?.enter?.(state, scope),
    }
  }

/**
 * Effects run only while someone subscribes: the first subscriber starts the current
 * state's effect, the last unsubscribe aborts it. An actor nobody subscribes to is inert,
 * so creating and discarding one (React StrictMode, SSR) has no side effects.
 */
export const actor = <S extends Tagged, E extends Tagged>(
  fsm: Machine<S, E>,
  initial: S = fsm.initial,
): Actor<S, E> => {
  let state = initial
  let running: AbortController | undefined
  const listeners = new Set<(state: S) => void>()
  const queue: E[] = []

  const enter = () => {
    const controller = new AbortController()
    running = controller
    // A rejected effect surfaces as an unhandled rejection, like a failing event handler.
    void fsm.enter(state, {
      signal: controller.signal,
      // A late send from a state the machine already left is dropped.
      send: (event) => {
        if (!controller.signal.aborted) send(event)
      },
    })
  }

  const step = (event: E) => {
    const next = fsm.transition(state, event)
    if (next === state) return
    state = next
    if (running) {
      running.abort()
      enter()
    }
    for (const listener of listeners) listener(state)
  }

  // Run to completion: a send from inside an effect or a listener waits for the current step.
  const send = (event: E) => {
    queue.push(event)
    if (queue.length > 1) return
    try {
      while (queue.length > 0) {
        step(queue[0]!)
        queue.shift()
      }
    } finally {
      queue.length = 0
    }
  }

  const subscribe = (listener: (state: S) => void) => {
    const entry = (next: S) => listener(next)
    listeners.add(entry)
    if (listeners.size === 1) enter()
    entry(state)
    return () => {
      listeners.delete(entry)
      if (listeners.size === 0 && running) {
        running.abort()
        running = undefined
      }
    }
  }

  return { get: () => state, send, subscribe }
}
