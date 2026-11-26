import { useInsertionEffect, useRef, useState, useSyncExternalStore } from "react"

import { actor, type Machine, type Tagged } from "../index.ts"

/**
 * `initial` is read once, like `useState`. Each step and each new effect runs through the latest
 * `machine`, so a factory machine rebuilt by `useMemo` keeps the state and uses its new handlers.
 */
export const useMachine = <S extends Tagged, E extends Tagged>(
  machine: Machine<S, E>,
  initial?: S,
): readonly [S, (event: E) => void, (event: E) => boolean] => {
  const latest = useRef(machine)
  // Runs before every layout effect, so a child's layout effect that sends reaches the new machine.
  useInsertionEffect(() => {
    latest.current = machine
  })
  const [running] = useState(() =>
    actor(
      {
        ...machine,
        transition: (state, event) => latest.current.transition(state, event),
        enter: (state, scope) => latest.current.enter(state, scope),
      },
      initial,
    ),
  )
  const state = useSyncExternalStore(running.subscribe, running.get, running.get)
  return [state, running.send, (event) => machine.can(state, event)] as const
}
