// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest"

import { actor } from "../../src/index.ts"
import { createPersister, type Discard, type StandardSchemaV1 } from "../../src/persist.ts"
import { CartEffect, CartZod, shop, type Cart } from "../shop.ts"

afterEach(() => {
  localStorage.clear()
})

const cart = shop(() => {})

test("a new actor resumes where the last one left off, through a Zod schema", () => {
  const persist = createPersister(localStorage, { version: 1 })
  const first = actor(cart, persist("cart", CartZod))
  first.send({ _tag: "add" })
  first.send({ _tag: "add" })

  const second = actor(cart, persist("cart", CartZod))

  expect(second.get()).toEqual({ _tag: "cart", items: 2 })
  expect(JSON.parse(localStorage.getItem("cart")!)).toEqual({
    version: 1,
    state: { _tag: "cart", items: 2 },
  })
})

test("a new actor resumes where the last one left off, through an Effect schema", () => {
  const persist = createPersister(localStorage)
  const first = actor(cart, persist("cart", CartEffect))
  first.send({ _tag: "add" })
  first.send({ _tag: "pay" })

  expect(actor(cart, persist("cart", CartEffect)).get()).toEqual({ _tag: "paying", items: 1 })
})

test("a state the schema leaves out is discarded, so the next actor starts fresh", () => {
  const discard = vi.fn<(key: string, reason: Discard) => void>()
  const persist = createPersister(localStorage, { discard })
  const first = actor(cart, persist("cart", CartZod))
  first.send({ _tag: "add" })
  first.send({ _tag: "pay" })
  first.send({ _tag: "confirm" })

  const second = actor(cart, persist("cart", CartZod))

  expect(second.get()).toEqual(cart.initial)
  expect(discard).toHaveBeenCalledWith("cart", {
    _tag: "invalid",
    issues: [expect.objectContaining({ message: expect.any(String) })],
  })
})

test("saved data the schema rejects is discarded with its issues", () => {
  localStorage.setItem("cart", JSON.stringify({ version: 0, state: { _tag: "cart", items: "2" } }))
  const discard = vi.fn<(key: string, reason: Discard) => void>()
  const persist = createPersister(localStorage, { discard })

  expect(actor(cart, persist("cart", CartEffect)).get()).toEqual(cart.initial)
  expect(discard).toHaveBeenCalledExactlyOnceWith("cart", {
    _tag: "invalid",
    issues: [expect.objectContaining({ path: ["items"] })],
  })
})

test("saved data from another version is discarded", () => {
  localStorage.setItem("cart", JSON.stringify({ version: 1, state: { _tag: "cart", items: 2 } }))
  const discard = vi.fn<(key: string, reason: Discard) => void>()
  const persist = createPersister(localStorage, { version: 2, discard })

  expect(actor(cart, persist("cart", CartZod)).get()).toEqual(cart.initial)
  expect(discard).toHaveBeenCalledExactlyOnceWith("cart", { _tag: "version", found: 1 })
})

test("saved data without an envelope is discarded as another version", () => {
  localStorage.setItem("cart", JSON.stringify({ _tag: "cart", items: 2 }))
  const discard = vi.fn<(key: string, reason: Discard) => void>()
  const persist = createPersister(localStorage, { discard })

  expect(actor(cart, persist("cart", CartZod)).get()).toEqual(cart.initial)
  expect(discard).toHaveBeenCalledExactlyOnceWith("cart", { _tag: "version", found: undefined })
})

test("corrupt JSON is discarded", () => {
  localStorage.setItem("cart", "{")
  const discard = vi.fn<(key: string, reason: Discard) => void>()
  const persist = createPersister(localStorage, { discard })

  expect(actor(cart, persist("cart", CartZod)).get()).toEqual(cart.initial)
  expect(discard).toHaveBeenCalledExactlyOnceWith("cart", { _tag: "json" })
})

test("a missing key starts from `initial` without discarding anything", () => {
  const discard = vi.fn<(key: string, reason: Discard) => void>()
  const persist = createPersister(localStorage, { discard })

  expect(actor(cart, persist("cart", CartZod)).get()).toEqual(cart.initial)
  expect(discard).not.toHaveBeenCalled()
})

test("an async schema throws an error that names the key", () => {
  localStorage.setItem("cart", JSON.stringify({ version: 0, state: { _tag: "cart", items: 2 } }))
  const Async: StandardSchemaV1<unknown, Cart> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: async () => ({ value: { _tag: "cart", items: 2 } }),
    },
  }
  const persist = createPersister(localStorage)

  expect(() => actor(cart, persist("cart", Async))).toThrow(
    '"cart": only synchronous schemas are supported',
  )
})

test("without storage, a slot loads nothing and saves nothing", () => {
  const persist = createPersister(undefined)
  const running = actor(cart, persist("cart", CartZod))

  running.send({ _tag: "add" })

  expect(running.get()).toEqual({ _tag: "cart", items: 1 })
  expect(actor(cart, persist("cart", CartZod)).get()).toEqual(cart.initial)
  expect(localStorage.length).toBe(0)
})
