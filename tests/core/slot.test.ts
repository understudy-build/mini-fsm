import { expect, test } from "vitest"

import { actor, type Slot } from "../../src/index.ts"
import { shop, type Cart } from "../shop.ts"

/** A slot over one saved value that records every save. */
const memory = (saved?: Cart) => {
  const saves: Array<Cart> = []
  const slot: Slot<Cart> = { load: () => saved, save: (state) => void saves.push(state) }
  return { slot, saves }
}

test("restores the saved state without running outputs, and starts its effect on the first subscribe", () => {
  const lines: Array<string> = []
  const { slot, saves } = memory({ _tag: "paying", items: 2 })

  const running = actor(
    shop((line) => lines.push(line)),
    slot,
  )
  expect(running.get()).toEqual({ _tag: "paying", items: 2 })
  expect(lines).toEqual([])

  running.subscribe(() => {})
  expect(lines).toEqual(["charge"])
  expect(saves).toEqual([])
})

test("an empty slot starts from `initial`", () => {
  const { slot } = memory()

  expect(
    actor(
      shop(() => {}),
      slot,
    ).get(),
  ).toEqual({ _tag: "cart", items: 0 })
})

test("a send with no subscribers saves the new state and starts no effect", () => {
  const lines: Array<string> = []
  const { slot, saves } = memory()
  const running = actor(
    shop((line) => lines.push(line)),
    slot,
  )

  running.send({ _tag: "add" })
  running.send({ _tag: "pay" })

  expect(saves).toEqual([
    { _tag: "cart", items: 1 },
    { _tag: "paying", items: 1 },
  ])
  expect(lines).not.toContain("charge")
})

test("a refused or ignored event saves nothing", () => {
  const { slot, saves } = memory()
  const running = actor(
    shop(() => {}),
    slot,
  )

  running.send({ _tag: "pay" }) // refused: the cart is empty
  running.send({ _tag: "confirm" }) // ignored: `cart` has no handler

  expect(saves).toEqual([])
})

test("saves before the listeners and outputs run", () => {
  const lines: Array<string> = []
  const slot: Slot<Cart> = {
    load: () => undefined,
    save: (state) => void lines.push(`save: ${state._tag}`),
  }
  const running = actor(
    shop((line) => lines.push(line)),
    slot,
  )
  running.subscribe((state) => lines.push(`listener: ${state._tag}`))

  running.send({ _tag: "add" })
  running.send({ _tag: "pay" })

  expect(lines).toEqual([
    "listener: cart",
    "save: cart",
    "listener: cart",
    "toast: Added",
    "save: paying",
    "listener: paying",
    "toast: Paying",
    "track: pay",
    "charge",
  ])
})

test("a save that throws comes out of `send`, and the state stays committed and its effect starts", () => {
  const lines: Array<string> = []
  const full = new DOMException("Quota exceeded", "QuotaExceededError")
  const slot: Slot<Cart> = {
    load: () => ({ _tag: "cart", items: 1 }),
    save: () => {
      throw full
    },
  }
  const running = actor(
    shop((line) => lines.push(line)),
    slot,
  )
  running.subscribe(() => {})

  expect(() => running.send({ _tag: "pay" })).toThrow(full)

  expect(running.get()).toEqual({ _tag: "paying", items: 1 })
  // Like a throwing listener, it stops the listeners and outputs left.
  expect(lines).toEqual(["charge"])
})
