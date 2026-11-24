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
  expect(verify(fixed, { events, invariants })).toEqual({
    _tag: "verified",
    states: 8,
    unreached: [],
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
  })
})
