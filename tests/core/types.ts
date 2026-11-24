// Compile-time checks, run by `pnpm typecheck`: each `@ts-expect-error` fails the typecheck
// if the line below it compiles. The checks call `door` directly: `expectTypeOf(door).toBeCallableWith`
// would check against the widest graph and let every move through.
import type { Readable } from "svelte/store"
import { expectTypeOf } from "vitest"

import { actor, machine } from "../../src/index.ts"
import { searchMachine, type State } from "../search.ts"

type Door = { _tag: "open" } | { _tag: "closed"; locked: boolean } | { _tag: "welded" }
type Push = { _tag: "push" } | { _tag: "weld" }

const door = machine<Door, Push>()

// An actor is a Svelte readable store, so `$search` works in markup.
expectTypeOf(actor(searchMachine)).toExtend<Readable<State>>()

// The graph keeps each state's literal exits.
expectTypeOf(searchMachine.graph.idle).toEqualTypeOf<readonly ["loading"]>()

// A guard returns `state` to ignore an event, and a final state may still update itself.
door({
  initial: { _tag: "open" },
  states: {
    open: { to: ["closed"], on: { push: () => ({ _tag: "closed", locked: false }) } },
    closed: {
      to: ["open", "welded"],
      on: {
        push: (state) => (state.locked ? state : { _tag: "open" }),
        weld: () => ({ _tag: "welded" }),
      },
    },
    welded: { to: [], on: { weld: () => ({ _tag: "welded" }) } },
  },
})

door({
  initial: { _tag: "open" },
  // @ts-expect-error every state tag must be handled: `welded` is missing
  states: { open: { to: ["closed"] }, closed: { to: [] } },
})

door({
  initial: { _tag: "open" },
  // @ts-expect-error `ajar` is not a state
  states: { open: { to: [] }, closed: { to: [] }, welded: { to: [] }, ajar: { to: [] } },
})

door({
  initial: { _tag: "open" },
  states: {
    // @ts-expect-error `to` only names states: `clsoed` is not one
    open: { to: ["clsoed"] },
    closed: { to: [] },
    welded: { to: [] },
  },
})

door({
  initial: { _tag: "open" },
  states: {
    // @ts-expect-error `open` may only move to `closed`
    open: { to: ["closed"], on: { push: () => ({ _tag: "welded" }) } },
    closed: { to: [] },
    welded: { to: [] },
  },
})

door({
  initial: { _tag: "open" },
  states: {
    open: { to: [] },
    closed: { to: [] },
    // @ts-expect-error a final state can't leave
    welded: { to: [], on: { push: () => ({ _tag: "open" }) } },
  },
})

door({
  initial: { _tag: "open" },
  states: {
    // @ts-expect-error an unknown event tag is rejected: `pull` is not an event
    open: { to: ["closed"], on: { pull: () => ({ _tag: "closed", locked: false }) } },
    closed: { to: [] },
    welded: { to: [] },
  },
})

door({
  initial: { _tag: "open" },
  states: {
    // @ts-expect-error `reenter` only names events: `pull` is not one
    open: { to: [], reenter: ["pull"] },
    closed: { to: [] },
    welded: { to: [] },
  },
})
