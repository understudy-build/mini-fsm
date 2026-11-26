import { expect, test } from "vitest"

import { machine } from "../../src/index.ts"
import { verify } from "../../src/verify.ts"
import { searchMachine } from "../search.ts"

type Job =
  | { readonly _tag: "queued" }
  | { readonly _tag: "running"; readonly attempt: number }
  | { readonly _tag: "failed"; readonly attempt: number }
  | { readonly _tag: "dead" }
type JobEvent = { readonly _tag: "start" } | { readonly _tag: "fail" } | { readonly _tag: "retry" }

const job = (limit: (attempt: number) => boolean) =>
  machine<Job, JobEvent>()({
    initial: { _tag: "queued" },
    states: {
      queued: { to: ["running"], on: { start: () => ({ _tag: "running", attempt: 1 }) } },
      running: {
        to: ["failed"],
        on: { fail: (state) => ({ _tag: "failed", attempt: state.attempt }) },
      },
      failed: {
        to: ["running", "dead"],
        on: {
          retry: (state) =>
            limit(state.attempt)
              ? { _tag: "dead" }
              : { _tag: "running", attempt: state.attempt + 1 },
        },
      },
      dead: { to: [] },
    },
  })

// `>` lets a fourth attempt run; `>=` stops at three.
const buggy = job((attempt) => attempt > 3)
const fixed = job((attempt) => attempt >= 3)

const events: ReadonlyArray<JobEvent> = [{ _tag: "start" }, { _tag: "fail" }, { _tag: "retry" }]
const invariants = {
  "at most 3 attempts": (state: Job) => !("attempt" in state) || state.attempt <= 3,
}

test("finds the shortest trace that breaks an invariant", () => {
  const report = verify(buggy, { events, invariants })

  expect(report).toMatchObject({ _tag: "broken", invariant: "at most 3 attempts" })
  expect(report._tag === "broken" && report.trace.map((step) => step.event._tag)).toEqual([
    "start",
    "fail",
    "retry",
    "fail",
    "retry",
    "fail",
    "retry",
  ])
})

test("verifies a machine once every reachable state holds its invariants", () => {
  // Inline, as in the README: the event literals must type against the machine's events.
  const report = verify(fixed, {
    events: [{ _tag: "start" }, { _tag: "fail" }, { _tag: "retry" }],
    invariants: { "at most 3 attempts": (state) => !("attempt" in state) || state.attempt <= 3 },
  })

  expect(report).toEqual({
    _tag: "verified",
    states: 8,
    unreached: [],
    stuck: [],
  })
})

test("a search that runs out of states exactly at depth still verifies", () => {
  // The last state, `dead`, is seven events deep and has no way out.
  expect(verify(fixed, { events, invariants, depth: 7 })).toMatchObject({ _tag: "verified" })
})

test("a search cut off by depth is partial, not verified", () => {
  // The broken trace is seven events long.
  expect(verify(buggy, { events, invariants, depth: 6 })).toEqual({
    _tag: "partial",
    states: 7,
    depth: 6,
  })
})

test("names the states the sample events never reach", () => {
  expect(verify(searchMachine, { events: [{ _tag: "resolve", items: [] }] })).toEqual({
    _tag: "verified",
    states: 1,
    unreached: ["loading", "success", "failure"],
    stuck: ["idle"],
  })
})

test("names a state that lists a way out but no sample event takes", () => {
  type Order = { _tag: "cart" } | { _tag: "pending" } | { _tag: "done" }
  const order = machine<Order, { _tag: "pay" } | { _tag: "confirm" }>()({
    initial: { _tag: "cart" },
    states: {
      cart: { to: ["pending"], on: { pay: () => ({ _tag: "pending" }) } },
      // Forgot `on: { confirm }`: nothing moves the order on.
      pending: { to: ["done"] },
      done: { to: [] },
    },
  })

  expect(verify(order, { events: [{ _tag: "pay" }, { _tag: "confirm" }] })).toEqual({
    _tag: "verified",
    states: 2,
    unreached: ["done"],
    stuck: ["pending"],
  })
})

test("names a state whose guard refuses or rebuilds it for every sample event", () => {
  type Order =
    | { _tag: "cart"; items: number }
    | { _tag: "pending"; paid: boolean }
    | { _tag: "done" }
  const order = machine<Order, { _tag: "pay" } | { _tag: "confirm" }>()({
    initial: { _tag: "cart", items: 0 },
    states: {
      // The guard says no to `pay` while the cart is empty, and the sample adds nothing.
      cart: {
        to: ["pending"],
        on: { pay: (state) => (state.items === 0 ? state : { _tag: "pending", paid: false }) },
      },
      // A new object with the same content is no change either.
      pending: { to: ["done"], on: { confirm: (state) => ({ ...state }) } },
      done: { to: [] },
    },
  })

  expect(order.transition(order.initial, { _tag: "pay" })._tag).toBe("refused")
  expect(verify(order, { events: [{ _tag: "pay" }, { _tag: "confirm" }] })).toEqual({
    _tag: "verified",
    states: 1,
    unreached: ["pending", "done"],
    stuck: ["cart"],
  })
  expect(
    verify(
      { ...order, initial: { _tag: "pending", paid: false } },
      { events: [{ _tag: "pay" }, { _tag: "confirm" }] },
    ),
  ).toMatchObject({ _tag: "verified", stuck: ["pending"] })
})

test("counts states equal up to key order once", () => {
  type Dial = { _tag: "off" } | { _tag: "on"; level: number }
  const dial = machine<Dial, { _tag: "turn" } | { _tag: "twist" }>()({
    initial: { _tag: "off" },
    states: {
      off: {
        to: ["on"],
        on: { turn: () => ({ _tag: "on", level: 1 }), twist: () => ({ level: 1, _tag: "on" }) },
      },
      on: { to: ["off"], on: { turn: () => ({ _tag: "off" }) } },
    },
  })

  expect(verify(dial, { events: [{ _tag: "turn" }, { _tag: "twist" }] })).toMatchObject({
    _tag: "verified",
    states: 2,
  })
})
