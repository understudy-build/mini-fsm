import { afterEach, expect, test, vi } from "vitest"

import { actor, machine } from "../../src/index.ts"
import { searchMachine, type State } from "../search.ts"
import { fakeFetch } from "../utils.ts"

afterEach(() => {
  vi.unstubAllGlobals()
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test("ignores an event the current state does not handle", () => {
  const search = actor(searchMachine)
  const seen: Array<State> = []
  search.subscribe((state) => seen.push(state))
  const before = search.get()

  search.send({ _tag: "resolve", items: ["a"] })

  expect(search.get()).toBe(before)
  expect(seen).toEqual([{ _tag: "idle" }])
})

test("runs no effect until someone subscribes", async () => {
  const requests = fakeFetch()
  const search = actor(searchMachine)

  search.send({ _tag: "search", query: "ts" })
  expect(requests).toHaveLength(0)

  search.subscribe(() => {})
  expect(requests.map((request) => request.url)).toEqual(["/search?q=ts"])

  requests[0]!.respond(["typescript"])
  await settle()
  expect(search.get()).toEqual({ _tag: "success", query: "ts", items: ["typescript"] })
})

test("a new search aborts the request in flight", async () => {
  const requests = fakeFetch()
  const search = actor(searchMachine)
  search.subscribe(() => {})

  search.send({ _tag: "search", query: "a" })
  search.send({ _tag: "search", query: "ab" })
  requests[1]!.respond(["abc"])
  await settle()

  expect(requests[0]!.signal.aborted).toBe(true)
  expect(search.get()).toEqual({ _tag: "success", query: "ab", items: ["abc"] })
})

test("drops a late send from a state the machine already left", async () => {
  const requests = fakeFetch({ honorAbort: false })
  const search = actor(searchMachine)
  search.subscribe(() => {})

  search.send({ _tag: "search", query: "a" })
  search.send({ _tag: "search", query: "ab" })
  requests[1]!.respond(["abc"])
  await settle()
  requests[0]!.respond(["stale"])
  await settle()

  expect(search.get()).toEqual({ _tag: "success", query: "ab", items: ["abc"] })
})

test("the last unsubscribe aborts the running effect", () => {
  const requests = fakeFetch()
  const search = actor(searchMachine, { _tag: "loading", query: "ts" })
  const stopFirst = search.subscribe(() => {})
  const stopSecond = search.subscribe(() => {})

  stopFirst()
  expect(requests[0]!.signal.aborted).toBe(false)
  stopSecond()
  expect(requests[0]!.signal.aborted).toBe(true)
})

test("a send from inside an effect waits for the current step, so listeners see every state in order", () => {
  type Light = { _tag: "red" } | { _tag: "green" } | { _tag: "yellow" }
  const light = machine<Light, { _tag: "next" }>()({
    initial: { _tag: "red" },
    states: {
      red: { to: ["green"], on: { next: () => ({ _tag: "green" }) } },
      // Passes straight through, like a guard state.
      green: {
        to: ["yellow"],
        on: { next: () => ({ _tag: "yellow" }) },
        enter: (_, { send }) => send({ _tag: "next" }),
      },
      yellow: { to: [] },
    },
  })
  const running = actor(light)
  const seen: Array<string> = []
  running.subscribe((state) => seen.push(state._tag))

  running.send({ _tag: "next" })

  expect(seen).toEqual(["red", "green", "yellow"])
})

test("a state stays in its tag without listing itself in `to`", () => {
  const requests = fakeFetch()
  const search = actor(searchMachine)
  search.subscribe(() => {})

  search.send({ _tag: "search", query: "a" })
  search.send({ _tag: "search", query: "ab" })

  expect(search.get()).toEqual({ _tag: "loading", query: "ab" })
  expect(requests).toHaveLength(2)
})

test("exposes the graph each state declared", () => {
  expect(searchMachine.graph).toEqual({
    idle: ["loading"],
    loading: ["success", "failure"],
    success: ["loading"],
    failure: ["loading"],
  })
})

test("throws when a handler the compiler can't see leaves the graph", () => {
  type Door = { readonly _tag: "open" } | { readonly _tag: "closed" }
  const door = machine<Door, { readonly _tag: "push" }>()({
    initial: { _tag: "open" },
    states: {
      // The cast stands in for JavaScript callers and `any` data.
      open: { to: [], on: { push: (() => ({ _tag: "closed" })) as never } },
      closed: { to: [] },
    },
  })

  expect(() => door.transition({ _tag: "open" }, { _tag: "push" })).toThrow(
    expect.objectContaining({ _tag: "IllegalTransition", from: "open", to: "closed" }),
  )
})

test("a same-tag update keeps the running effect", () => {
  type Upload = { _tag: "uploading"; pct: number } | { _tag: "done" }
  const started: Array<AbortSignal> = []
  const upload = machine<Upload, { _tag: "progress"; pct: number }>()({
    initial: { _tag: "uploading", pct: 0 },
    states: {
      uploading: {
        to: ["done"],
        on: { progress: (state, event) => ({ ...state, pct: event.pct }) },
        enter: (_, { signal }) => {
          started.push(signal)
        },
      },
      done: { to: [] },
    },
  })
  const running = actor(upload)
  running.subscribe(() => {})

  running.send({ _tag: "progress", pct: 50 })

  expect(running.get()).toEqual({ _tag: "uploading", pct: 50 })
  expect(started.map((signal) => signal.aborted)).toEqual([false])
})

test("a failed request becomes the event `catch` returns", async () => {
  const requests = fakeFetch()
  const search = actor(searchMachine)
  search.subscribe(() => {})

  search.send({ _tag: "search", query: "ts" })
  requests[0]!.respond({ not: "a list" })
  await settle()

  expect(search.get()).toEqual({ _tag: "failure", query: "ts", error: "Error: Malformed response" })
})

test("an effect that throws synchronously still leaves listeners on the current state", async () => {
  type Door = { _tag: "open" } | { _tag: "closed" }
  const door = machine<Door, { _tag: "push" } | { _tag: "jammed" }>()({
    initial: { _tag: "open" },
    states: {
      open: { to: ["closed"], on: { push: () => ({ _tag: "closed" }) } },
      closed: {
        to: [],
        enter: () => {
          throw new Error("motor")
        },
        catch: () => ({ _tag: "jammed" }),
      },
    },
  })
  const running = actor(door)
  const seen: Array<string> = []
  running.subscribe((state) => seen.push(state._tag))

  running.send({ _tag: "push" })
  await settle()

  expect(running.get()).toEqual({ _tag: "closed" })
  expect(seen).toEqual(["open", "closed"])
})

test("a subscriber sees the initial state before its effect moves on", () => {
  type Boot = { _tag: "checking" } | { _tag: "ready" }
  const boot = machine<Boot, { _tag: "ok" }>()({
    initial: { _tag: "checking" },
    states: {
      checking: {
        to: ["ready"],
        on: { ok: () => ({ _tag: "ready" }) },
        enter: (_, { send }) => send({ _tag: "ok" }),
      },
      ready: { to: [] },
    },
  })
  const seen: Array<string> = []

  actor(boot).subscribe((state) => seen.push(state._tag))

  expect(seen).toEqual(["checking", "ready"])
})

test("transition reports an event the state has no handler for", () => {
  expect(searchMachine.transition({ _tag: "idle" }, { _tag: "resolve", items: [] })).toEqual({
    _tag: "ignored",
  })
})

test("a listener that throws during an effect's send is reported, not turned into the effect's failure", async () => {
  type Upload =
    | { _tag: "uploading"; pct: number }
    | { _tag: "done" }
    | { _tag: "failed"; error: string }
  const upload = machine<
    Upload,
    { _tag: "progress"; pct: number } | { _tag: "fail"; error: string }
  >()({
    initial: { _tag: "uploading", pct: 0 },
    states: {
      uploading: {
        to: ["done", "failed"],
        on: {
          progress: (state, event) => ({ ...state, pct: event.pct }),
          fail: (_, event) => ({ _tag: "failed", error: event.error }),
        },
        enter: async (_, { send }) => {
          await Promise.resolve()
          send({ _tag: "progress", pct: 50 })
        },
        catch: (error) => ({ _tag: "fail", error: String(error) }),
      },
      done: { to: [] },
      failed: { to: [] },
    },
  })
  const reported: Array<() => void> = []
  vi.stubGlobal("queueMicrotask", (task: () => void) => reported.push(task))
  const render = new Error("render")
  const running = actor(upload)

  running.subscribe((state) => {
    if (state._tag === "uploading" && state.pct === 50) throw render
  })
  await settle()

  expect(running.get()).toEqual({ _tag: "uploading", pct: 50 })
  expect(reported).toHaveLength(1)
  expect(reported[0]).toThrow(render)
})

test("can take an event that moves the machine or updates its state", () => {
  expect(searchMachine.can({ _tag: "idle" }, { _tag: "search", query: "ts" })).toBe(true)
  // Same tag, new value: a second search while one is loading.
  expect(searchMachine.can({ _tag: "loading", query: "t" }, { _tag: "search", query: "ts" })).toBe(
    true,
  )
})

test("cannot take an event the state ignores or a guard refuses", () => {
  type Door = { _tag: "closed"; locked: boolean } | { _tag: "open" }
  const door = machine<Door, { _tag: "push" } | { _tag: "lock" }>()({
    initial: { _tag: "closed", locked: true },
    states: {
      closed: { to: ["open"], on: { push: (state) => (state.locked ? state : { _tag: "open" }) } },
      open: { to: [] },
    },
  })

  expect(door.can({ _tag: "closed", locked: false }, { _tag: "lock" })).toBe(false)
  expect(door.can({ _tag: "closed", locked: true }, { _tag: "push" })).toBe(false)
  expect(door.can({ _tag: "closed", locked: false }, { _tag: "push" })).toBe(true)

  const running = actor(door)
  expect(running.can({ _tag: "push" })).toBe(false)
})

test("a guard that returns `state` refuses, even for a `reenter` event", () => {
  type Dial = { _tag: "on"; level: number }
  const dial = machine<Dial, { _tag: "turn"; level: number }>()({
    initial: { _tag: "on", level: 1 },
    states: {
      on: {
        to: [],
        on: {
          turn: (state, event) => (event.level > 3 ? state : { ...state, level: event.level }),
        },
        reenter: ["turn"],
      },
    },
  })

  expect(dial.transition(dial.initial, { _tag: "turn", level: 5 })).toEqual({
    _tag: "refused",
    outputs: [],
  })
  expect(dial.transition(dial.initial, { _tag: "turn", level: 2 })).toEqual({
    _tag: "entered",
    state: { _tag: "on", level: 2 },
    outputs: [],
  })
})
