import { createSignal, isHydrating, onSettled, type Accessor } from "solid-js"

import { actor, type Machine, type Slot, type Tagged } from "../index.ts"

/**
 * Effects start once the component settles in the browser, so server rendering never runs them.
 * `can` reads `state`, so a computation that calls it tracks the machine. While hydrating, `state`
 * is the state before loading, as on the server, and moves to the loaded one once it settles.
 */
export const createMachine = <S extends Tagged, E extends Tagged>(
  machine: Machine<S, E>,
  from?: NoInfer<S | Slot<S>>,
): readonly [Accessor<S>, (event: E) => void, (event: E) => boolean] => {
  const running = actor(machine, from)
  const [state, set] = createSignal(
    // Solid's overloads cannot rule out a function for a generic `S`; states are plain tagged objects.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    (isHydrating() && from && !("_tag" in from) ? machine.initial : running.get()) as Exclude<
      S,
      Function
    >,
  )
  onSettled(() => running.subscribe((next) => set(() => next)))
  return [state, running.send, (event) => machine.can(state(), event)]
}
