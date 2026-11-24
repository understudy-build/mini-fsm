import { expect, test } from "vitest"

import { check } from "../../src/check.ts"
import { machine } from "../../src/index.ts"
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

const events: ReadonlyArray<JobEvent> = [{ _tag: "start" }, { _tag: "fail" }, { _tag: "retry" }]
const invariants = {
  "at most 3 attempts": (state: Job) => !("attempt" in state) || state.attempt <= 3,
}

test("finds the shortest trace that breaks an invariant", () => {
  const report = check(
    job((attempt) => attempt > 3),
    { events, invariants },
  )

  expect(report).toMatchObject({ _tag: "failed", invariant: "at most 3 attempts" })
  expect(report._tag === "failed" && report.trace.map((step) => step.event._tag)).toEqual([
    "start",
    "fail",
    "retry",
    "fail",
    "retry",
    "fail",
    "retry",
  ])
})

test("passes a machine that holds its invariants, and names states it never reached", () => {
  expect(
    check(
      job((attempt) => attempt >= 3),
      { events, invariants },
    ),
  ).toEqual({
    _tag: "passed",
    states: 8,
    unreached: [],
  })
  expect(check(searchMachine, { events: [{ _tag: "resolve", items: [] }] })).toEqual({
    _tag: "passed",
    states: 1,
    unreached: ["loading", "success", "failure"],
  })
})
