import { createSubscriber } from "svelte/reactivity"

import { actor, type Machine, type Tagged } from "../index.ts"

/**
 * Effects run while an effect or template reads `state`, so server rendering never runs them.
 * Read `state` from the object; destructuring it copies one value and loses reactivity.
 */
export const createMachine = <S extends Tagged, E extends Tagged>(
  machine: Machine<S, E>,
  initial?: S,
): { readonly state: S; readonly send: (event: E) => void } => {
  const running = actor(machine, initial)
  const track = createSubscriber((update) => running.subscribe(update))
  return {
    get state(): S {
      track()
      return running.get()
    },
    send: running.send,
  }
}
