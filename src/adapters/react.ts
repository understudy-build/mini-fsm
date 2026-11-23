import { useState, useSyncExternalStore } from "react"

import { actor, type Machine, type Tagged } from "../index.ts"

/** `initial` is read once, like `useState`. */
export const useMachine = <S extends Tagged, E extends Tagged>(
  machine: Machine<S, E>,
  initial?: S,
): readonly [S, (event: E) => void] => {
  const [running] = useState(() => actor(machine, initial))
  const state = useSyncExternalStore(running.subscribe, running.get, running.get)
  return [state, running.send] as const
}
