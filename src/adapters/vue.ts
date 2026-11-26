import { getCurrentInstance, onBeforeUnmount, onMounted, shallowRef, type ShallowRef } from "vue"

import { actor, type Machine, type Slot, type Tagged } from "../index.ts"

/**
 * Effects start on mount, so server rendering never runs them. `can` reads `state.value`, so a
 * template or `computed` that calls it tracks the machine. While hydrating, `state` is the state
 * before loading, as on the server, and moves to the loaded one on mount.
 */
export const useMachine = <S extends Tagged, E extends Tagged>(
  machine: Machine<S, E>,
  from?: NoInfer<S | Slot<S>>,
): readonly [Readonly<ShallowRef<S>>, (event: E) => void, (event: E) => boolean] => {
  const running = actor(machine, from)
  // Vue gives a component its element before setup only when it hydrates one.
  const hydrating = getCurrentInstance()?.vnode.el
  // Vue's overloads cannot rule out a nested ref for a generic `S`; states are plain tagged objects.
  const state = shallowRef(
    hydrating && from && !("_tag" in from) ? machine.initial : running.get(),
  ) as ShallowRef<S>
  let stop: (() => void) | undefined
  onMounted(() => {
    stop = running.subscribe((next) => {
      state.value = next
    })
  })
  onBeforeUnmount(() => stop?.())
  return [state, running.send, (event) => machine.can(state.value, event)]
}
