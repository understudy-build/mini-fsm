export type Tagged = { readonly _tag: string }

type Of<U extends Tagged, K extends U["_tag"]> = Extract<U, { readonly _tag: K }>

/** What a state's `enter` effect gets. `signal` aborts when the machine leaves the state. */
export type Scope<E extends Tagged> = {
  readonly send: (event: E) => void
  readonly signal: AbortSignal
}

/** For each state tag, the other states it may move to. Staying in the same tag is always allowed. */
export type Graph<S extends Tagged> = { readonly [K in S["_tag"]]: ReadonlyArray<S["_tag"]> }

/** Queues a side effect to run once, after this step commits. Never runs on restore, in `verify` or in `can`. */
export type After = (run: () => void) => void

type Outputs = ReadonlyArray<() => void>

/**
 * What one event did. `ignored`: the state has no handler for it. `refused`: a guard returned
 * `state`. `stayed`: the machine kept its tag and its running effect. `entered`: the machine
 * entered a state, so its effect starts. `outputs` holds what the handler queued with `after`.
 */
export type Step<S extends Tagged> =
  | { readonly _tag: "ignored" }
  | { readonly _tag: "refused"; readonly outputs: Outputs }
  | { readonly _tag: "stayed"; readonly state: S; readonly outputs: Outputs }
  | { readonly _tag: "entered"; readonly state: S; readonly outputs: Outputs }

type Node<
  S extends Tagged,
  E extends Tagged,
  K extends S["_tag"],
  To extends ReadonlyArray<S["_tag"]>,
> = {
  /** The other states this one may move to. `[]` marks a final state. */
  readonly to: To
  readonly on?: {
    readonly [T in E["_tag"]]?: (
      state: Of<S, K>,
      event: Of<E, T>,
      after: After,
    ) => Of<S, K | To[number]>
  }
  /** Events whose same-tag result restarts `enter`. Any other same-tag result keeps it running. */
  readonly reenter?: ReadonlyArray<E["_tag"]>
  readonly enter?: (state: Of<S, K>, scope: Scope<E>) => void | Promise<void>
  /** Turns an error thrown or rejected by `enter` into an event. Without it, the error is unhandled. */
  readonly catch?: (error: unknown) => E
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
   * Pure: it collects what handlers queue with `after` and runs none of it. Throws
   * `IllegalTransition` when a handler returns a state its `to` doesn't list.
   */
  readonly transition: (state: S, event: E) => Step<S>
  /**
   * Whether `event` would change `state`: false when the state has no handler for it or a guard
   * returns `state`. Use it to disable the control that sends the event. Runs no outputs.
   */
  readonly can: (state: S, event: E) => boolean
  /** Starts the state's effect. Never throws: errors become events through `catch`, or go unhandled. */
  readonly enter: (state: S, scope: Scope<E>) => void
}

export type Actor<S extends Tagged, E extends Tagged> = {
  readonly get: () => S
  readonly send: (event: E) => void
  /** `machine.can` against the current state. */
  readonly can: (event: E) => boolean
  /** Svelte store contract: calls `listener` now, then on every change. */
  readonly subscribe: (listener: (state: S) => void) => () => void
}

/**
 * Where an actor loads its first state and saves each new one. `load` may return fewer states than
 * `save` takes, as a schema that leaves out a final state does, so `Saved` can be wider than `S`.
 */
export type Slot<S, Saved = S> = {
  /** The saved state, or undefined when there is none or it no longer decodes. */
  readonly load: () => S | undefined
  readonly save: (state: Saved) => void
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
  readonly on?: Readonly<Record<string, ((state: S, event: E, after: After) => S) | undefined>>
  readonly reenter?: ReadonlyArray<string>
  readonly enter?: (state: S, scope: Scope<E>) => void | Promise<void>
  readonly catch?: (error: unknown) => E
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
    const transition = (state: S, event: E): Step<S> => {
      const node = states[state._tag]
      const handler = node?.on?.[event._tag]
      if (!node || !handler) return { _tag: "ignored" }
      const outputs: Array<() => void> = []
      let open = true
      let next: S
      try {
        next = handler(state, event, (run) => {
          if (!open) throw new Error("`after` was called once its handler returned")
          outputs.push(run)
        })
      } finally {
        open = false
      }
      // A guard that returns `state` refuses, even for a `reenter` event.
      if (next === state) return { _tag: "refused", outputs }
      if (next._tag !== state._tag) {
        if (!node.to.includes(next._tag)) throw new IllegalTransition(state._tag, next._tag)
        return { _tag: "entered", state: next, outputs }
      }
      return {
        _tag: node.reenter?.includes(event._tag) ? "entered" : "stayed",
        state: next,
        outputs,
      }
    }
    return {
      initial: definition.initial,
      // `fromEntries` drops the keys, which are exactly the tags `G` maps.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      graph: graph as never,
      transition,
      // `stayed` or `entered`.
      can: (state, event) => "state" in transition(state, event),
      enter: (state, scope) => {
        const node = states[state._tag]
        if (!node?.enter) return
        const run = node.enter
        // `new Promise` turns a synchronous throw into a rejection, so both take one path.
        new Promise<void>((resolve) => resolve(run(state, scope))).catch((error: unknown) => {
          // The state is gone: its late errors are dropped, like its late sends.
          if (scope.signal.aborted) return
          if (!node.catch) throw error
          scope.send(node.catch(error))
        })
      },
    }
  }

/**
 * Effects run only while someone subscribes: the first subscriber starts the current
 * state's effect, the last unsubscribe aborts it. An actor nobody subscribes to is inert,
 * so creating and discarding one (React StrictMode, SSR) has no side effects.
 *
 * `from` is a state, or a slot the actor loads once now and saves every new state to.
 */
export const actor = <S extends Tagged, E extends Tagged>(
  fsm: Machine<S, E>,
  from: NoInfer<S | Slot<S>> = fsm.initial,
): Actor<S, E> => {
  let slot: Slot<S> | undefined
  // States always have `_tag`, and slots never do. Loading runs no handler, so no output runs.
  let state = "_tag" in from ? from : ((slot = from).load() ?? fsm.initial)
  let running: AbortController | undefined
  const listeners = new Set<(state: S) => void>()
  const queue: E[] = []

  const enter = () => {
    const controller = new AbortController()
    running = controller
    fsm.enter(state, {
      signal: controller.signal,
      // A late send from a state the machine already left is dropped.
      send: (event) => {
        if (controller.signal.aborted) return
        try {
          send(event)
        } catch (error) {
          // A listener or handler bug isn't the effect failing: report it instead of reaching `catch`.
          queueMicrotask(() => {
            throw error
          })
        }
      },
    })
  }

  // Leave, commit, save, notify, run outputs, then enter: listeners never see a state its effect has
  // not settled into, outputs see the committed state, and an effect never starts for a state
  // listeners have not seen. A refused step only runs its outputs. The first throw, from `save`, a
  // listener or an output, stops the rest and leaves `send` once the effect has started.
  const step = (event: E) => {
    const result = fsm.transition(state, event)
    if (result._tag === "ignored") return
    const restart = result._tag === "entered" && running !== undefined
    if (restart) running?.abort()
    try {
      if (result._tag !== "refused") {
        state = result.state
        slot?.save(state)
        for (const listener of listeners) listener(state)
      }
      for (const run of result.outputs) run()
    } finally {
      if (restart) enter()
    }
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
    // Call first: a throwing listener is never added, and it sees the state its effect starts from.
    entry(state)
    listeners.add(entry)
    if (listeners.size === 1) enter()
    return () => {
      listeners.delete(entry)
      if (listeners.size === 0 && running) {
        running.abort()
        running = undefined
      }
    }
  }

  return { get: () => state, send, can: (event) => fsm.can(state, event), subscribe }
}
