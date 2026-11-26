import {
  getCurrentInstance,
  inject,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  ssrContextKey,
  type ShallowRef,
} from "vue"

import { actor, type Machine, type Slot, type Tagged } from "../index.ts"

/**
 * Effects start on mount, so server rendering never runs them. `can` reads `state.value`, so a
 * template or `computed` that calls it tracks the machine. The server and hydration render the
 * state before loading, so they match, and `state` moves to the loaded one on mount.
 */
export const useMachine = <S extends Tagged, E extends Tagged>(
  machine: Machine<S, E>,
  from?: NoInfer<S | Slot<S>>,
): readonly [Readonly<ShallowRef<S>>, (event: E) => void, (event: E) => boolean] => {
  const running = actor(machine, from)
  const instance = getCurrentInstance()
  // The server provides its render context, and Vue gives a component its element before setup
  // only when it hydrates one.
  const early = instance && (inject(ssrContextKey, null) || instance.vnode.el)
  // Vue's overloads cannot rule out a nested ref for a generic `S`; states are plain tagged objects.
  const state = shallowRef(
    early && from && !("_tag" in from) ? machine.initial : running.get(),
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
