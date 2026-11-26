import { useInsertionEffect, useRef, useState, useSyncExternalStore } from "react"

import { actor, type Machine, type Slot, type Tagged } from "../index.ts"

/**
 * `from` is a state or a slot, read once like `useState`. Each step and each new effect runs
 * through the latest `machine`, so a factory machine rebuilt by `useMemo` keeps the state and uses
 * its new handlers. The server and hydration render the state before loading, then React renders
 * again with the loaded one.
 */
export const useMachine = <S extends Tagged, E extends Tagged>(
  machine: Machine<S, E>,
  from?: NoInfer<S | Slot<S>>,
): readonly [S, (event: E) => void, (event: E) => boolean] => {
  const latest = useRef(machine)
  // Runs before every layout effect, so a child's layout effect that sends reaches the new machine.
  useInsertionEffect(() => {
    latest.current = machine
  })
  const [[running, before]] = useState(() => {
    const created = actor(
      {
        ...machine,
        transition: (state, event) => latest.current.transition(state, event),
        enter: (state, scope) => latest.current.enter(state, scope),
      },
      from,
    )
    return [created, from && !("_tag" in from) ? machine.initial : created.get()] as const
  })
  const state = useSyncExternalStore(running.subscribe, running.get, () => before)
  return [state, running.send, (event) => machine.can(state, event)] as const
}
