// @vitest-environment happy-dom
import { fireEvent, screen } from "@testing-library/dom"
import { createRenderEffect, createRoot, flush } from "solid-js"
import { afterEach, expect, test, vi } from "vitest"

import { createMachine } from "../../src/adapters/solid.ts"
import { searchMachine } from "../search.ts"
import { shop } from "../shop.ts"
import { fakeFetch } from "../utils.ts"

afterEach(() => {
  vi.unstubAllGlobals()
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
