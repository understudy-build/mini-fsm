// @vitest-environment happy-dom
import { fireEvent, screen } from "@testing-library/dom"
import * as solid from "solid-js"
import { createRenderEffect, createRoot, flush } from "solid-js"
import { afterEach, expect, test, vi } from "vitest"

import { createMachine } from "../../src/adapters/solid.ts"
import { createPersister } from "../../src/persist.ts"
import { searchMachine } from "../search.ts"
import { CartZod, shop } from "../shop.ts"
import { fakeFetch } from "../utils.ts"

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  document.body.innerHTML = ""
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test("tracks state and aborts the request in flight on dispose", async () => {
  const requests = fakeFetch()
  const root = createRoot((dispose) => {
    const [state, send] = createMachine(searchMachine)
    return { state, send, dispose }
  })
  flush()
  const { state, send } = root

  send({ _tag: "search", query: "ts" })
  flush()
  expect(state()).toEqual({ _tag: "loading", query: "ts" })

  send({ _tag: "search", query: "tsx" })
  requests[1]!.respond(["tsx"])
  await settle()
  flush()
  expect(state()).toEqual({ _tag: "success", query: "tsx", items: ["tsx"] })

  send({ _tag: "search", query: "again" })
  root.dispose()
  expect(requests[2]!.signal.aborted).toBe(true)
})

// No JSX compiler in the tests: the effect renders the control by hand.
const button = (name: string, onclick: () => void) => {
  const element = document.createElement("button")
  element.type = "button"
  element.textContent = name
  element.addEventListener("click", onclick)
  document.body.append(element)
  return element
}

test("a control follows what the machine can take", () => {
  const root = createRoot((dispose) => {
    const [, send, can] = createMachine(shop(() => {}))
    button("Add", () => send({ _tag: "add" }))
    const pay = button("Pay", () => send({ _tag: "pay" }))
    createRenderEffect(
      () => can({ _tag: "pay" }),
      (enabled) => {
        pay.disabled = !enabled
      },
    )
    return { dispose }
  })
  flush()
  const pay = screen.getByRole("button", { name: "Pay" })
  expect(pay).toHaveProperty("disabled", true)

  fireEvent.click(screen.getByRole("button", { name: "Add" }))
  flush()

  expect(pay).toHaveProperty("disabled", false)
  root.dispose()
})

// Hydrating for real needs `@solidjs/web` and an SSR JSX build. `hydrate()` sets this flag while it
// claims the server's DOM, and `isHydrating()` reads it.
const { sharedConfig } = solid as unknown as { sharedConfig: { hydrating: boolean } }

test("while hydrating, `state` is the state the server rendered, and moves to the saved one once settled", () => {
  localStorage.setItem("cart", JSON.stringify({ version: 0, state: { _tag: "cart", items: 2 } }))
  const persist = createPersister(localStorage)
  sharedConfig.hydrating = true
  const root = createRoot((dispose) => {
    const [state] = createMachine(
      shop(() => {}),
      persist("cart", CartZod),
    )
    return { state, dispose }
  })
  sharedConfig.hydrating = false

  expect(root.state()).toEqual({ _tag: "cart", items: 0 })
  flush()
  expect(root.state()).toEqual({ _tag: "cart", items: 2 })
  root.dispose()
})

test("a client-only render has the saved state from the start", () => {
  localStorage.setItem("cart", JSON.stringify({ version: 0, state: { _tag: "cart", items: 2 } }))
  const persist = createPersister(localStorage)

  const root = createRoot((dispose) => {
    const [state] = createMachine(
      shop(() => {}),
      persist("cart", CartZod),
    )
    return { state, dispose }
  })

  expect(root.state()).toEqual({ _tag: "cart", items: 2 })
  root.dispose()
})
