import { afterEach, expect, test, vi } from "vitest"

import { actor, IllegalTransition, machine, type After } from "../../src/index.ts"
import { verify } from "../../src/verify.ts"
import { shop, type Cart } from "../shop.ts"

afterEach(() => {
  vi.unstubAllGlobals()
})

test("an output runs once per send, however many listen", () => {
  const lines: Array<string> = []
  const running = actor(shop((line) => lines.push(line)))
  running.subscribe(() => {})
  running.subscribe(() => {})

  running.send({ _tag: "add" })
  running.send({ _tag: "add" })

  expect(lines).toEqual(["toast: Added", "toast: Added"])
})

test("a refused step runs its outputs and notifies no listener", () => {
  const lines: Array<string> = []
  const running = actor(shop((line) => lines.push(line)))
  const seen: Array<Cart> = []
  running.subscribe((state) => seen.push(state))

  running.send({ _tag: "pay" })

  expect(lines).toEqual(["toast: Your cart is empty"])
  expect(seen).toEqual([{ _tag: "cart", items: 0 }])
})

test("a refused step leaves the running effect running", () => {
  const signals: Array<AbortSignal> = []
  type Door = { _tag: "closed"; locked: boolean }
  const door = machine<Door, { _tag: "open" }>()({
    initial: { _tag: "closed", locked: true },
    states: {
      closed: {
        to: [],
        on: {
          open: (state, _, after) => {
            after(() => {})
            return state
          },
        },
        reenter: ["open"],
        enter: (_, { signal }) => {
          signals.push(signal)
        },
      },
    },
  })
  const running = actor(door)
  running.subscribe(() => {})

  running.send({ _tag: "open" })

  expect(signals.map((signal) => signal.aborted)).toEqual([false])
})

test("listeners see the new state before outputs run, and outputs run before `enter`", () => {
  const lines: Array<string> = []
  const running = actor(shop((line) => lines.push(line)))
  running.subscribe((state) => lines.push(`listener: ${state._tag}`))

  running.send({ _tag: "add" })
  running.send({ _tag: "pay" })

  expect(lines).toEqual([
    "listener: cart",
    "listener: cart",
    "toast: Added",
    "listener: paying",
    "toast: Paying",
    "track: pay",
    "charge",
  ])
})

test("a send from an output waits for the current step, including its `enter`", () => {
  const lines: Array<string> = []
  const running = actor(
    shop((line) => {
      lines.push(line)
      if (line === "track: pay") running.send({ _tag: "confirm" })
    }),
    { _tag: "cart", items: 1 },
  )
  running.subscribe((state) => lines.push(`listener: ${state._tag}`))

  running.send({ _tag: "pay" })

  expect(lines).toEqual([
    "listener: cart",
    "listener: paying",
    "toast: Paying",
    "track: pay",
    "charge",
    "listener: paid",
  ])
})

test("a step that leaves the graph drops its outputs", () => {
  const lines: Array<string> = []
  const door = machine<{ _tag: "open" } | { _tag: "closed" }, { _tag: "push" }>()({
    initial: { _tag: "open" },
    states: {
      open: {
        to: [],
        // The cast stands in for JavaScript callers and `any` data.
        on: {
          push: ((_: unknown, __: unknown, after: After) => {
            after(() => lines.push("toast: Closed"))
            return { _tag: "closed" }
          }) as never,
        },
      },
      closed: { to: [] },
    },
  })
  const running = actor(door)
  running.subscribe(() => {})

  expect(() => running.send({ _tag: "push" })).toThrow(IllegalTransition)
  expect(lines).toEqual([])
  expect(running.get()).toEqual({ _tag: "open" })
})

test("restoring, subscribing, `verify` and `can` run no outputs", () => {
  const lines: Array<string> = []
  const cart = shop((line) => lines.push(line))

  actor(cart, { _tag: "cart", items: 2 }).subscribe(() => {})
  verify(cart, { events: [{ _tag: "add" }, { _tag: "pay" }, { _tag: "confirm" }], depth: 3 })
  cart.can({ _tag: "cart", items: 0 }, { _tag: "pay" })
  actor(cart).can({ _tag: "add" })

  expect(lines).toEqual([])
})

test("calling `after` once its handler has returned throws", () => {
  let late: After | undefined
  const counter = machine<{ _tag: "count"; n: number }, { _tag: "add" }>()({
    initial: { _tag: "count", n: 0 },
    states: {
      count: {
        to: [],
        on: {
          add: (state, _, after) => {
            late = after
            return { ...state, n: state.n + 1 }
          },
        },
      },
    },
  })

  counter.transition(counter.initial, { _tag: "add" })

  expect(() => late?.(() => {})).toThrow("`after` was called once its handler returned")
})

test("a throwing output stops the outputs left and leaves `send` once `enter` has started", () => {
  const lines: Array<string> = []
  const toast = new Error("toast")
  const running = actor(
    shop((line) => {
      if (line === "toast: Paying") throw toast
      lines.push(line)
    }),
    { _tag: "cart", items: 1 },
  )
  running.subscribe(() => {})

  expect(() => running.send({ _tag: "pay" })).toThrow(toast)
  expect(lines).toEqual(["charge"])
  expect(running.get()).toEqual({ _tag: "paying", items: 1 })
})

test("an output that throws during an effect's send is reported, not turned into the effect's failure", async () => {
  type Upload = { _tag: "uploading" } | { _tag: "done" } | { _tag: "failed" }
  const toast = new Error("toast")
  const upload = machine<Upload, { _tag: "finish" } | { _tag: "fail" }>()({
    initial: { _tag: "uploading" },
    states: {
      uploading: {
        to: ["done", "failed"],
        on: {
          finish: (_, __, after) => {
            after(() => {
              throw toast
            })
            return { _tag: "done" }
          },
          fail: () => ({ _tag: "failed" }),
        },
        enter: async (_, { send }) => {
          await Promise.resolve()
          send({ _tag: "finish" })
        },
        catch: () => ({ _tag: "fail" }),
      },
      done: { to: [] },
      failed: { to: [] },
    },
  })
  const reported: Array<() => void> = []
  vi.stubGlobal("queueMicrotask", (task: () => void) => reported.push(task))
  const running = actor(upload)

  running.subscribe(() => {})
  await vi.waitFor(() => expect(reported).toHaveLength(1))

  expect(running.get()).toEqual({ _tag: "done" })
  expect(reported[0]).toThrow(toast)
})

test("`transition` collects outputs without running them", () => {
  const lines: Array<string> = []
  const cart = shop((line) => lines.push(line))

  const step = cart.transition({ _tag: "cart", items: 1 }, { _tag: "pay" })

  expect(step).toMatchObject({ _tag: "entered", state: { _tag: "paying", items: 1 } })
  expect(lines).toEqual([])
  for (const run of "outputs" in step ? step.outputs : []) run()
  expect(lines).toEqual(["toast: Paying", "track: pay"])
})
