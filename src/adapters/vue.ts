import { onBeforeUnmount, onMounted, shallowRef, type ShallowRef } from "vue"

import { actor, type Machine, type Tagged } from "../index.ts"

/** Effects start on mount, so server rendering never runs them. */
export const useMachine = <S extends Tagged, E extends Tagged>(
  machine: Machine<S, E>,
  initial?: S,
): readonly [Readonly<ShallowRef<S>>, (event: E) => void] => {
  const running = actor(machine, initial)
  // Vue's overloads cannot rule out a nested ref for a generic `S`; states are plain tagged objects.
  const state = shallowRef(running.get()) as ShallowRef<S>
  let stop: (() => void) | undefined
  onMounted(() => {
    stop = running.subscribe((next) => {
      state.value = next
    })
  })
  onBeforeUnmount(() => stop?.())
  return [state, running.send]
}
