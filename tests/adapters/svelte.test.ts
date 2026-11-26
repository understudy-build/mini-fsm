// @vitest-environment happy-dom
import { readFileSync, rmSync, writeFileSync } from "node:fs"

import { fireEvent, screen } from "@testing-library/dom"
import { flushSync, hydrate, mount, unmount, type Component } from "svelte"
import { compile } from "svelte/compiler"
import { render } from "svelte/server"
import { afterEach, expect, test, vi } from "vitest"

import { createPersister, type Persist } from "../../src/persist.ts"
import { fakeFetch } from "../utils.ts"
import Cart from "./Cart.svelte"
import Search from "./Search.svelte"
import Shop from "./Shop.svelte"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  document.body.innerHTML = ""
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test("shows results after a search", async () => {
  const requests = fakeFetch()
  mount(Search, { target: document.body })

  fireEvent.click(screen.getByRole("button", { name: "Search" }))
  flushSync()
  expect(screen.getByText("Loading ts")).toBeTruthy()
  requests[0]!.respond(["typescript"])
  await settle()
  flushSync()

  expect(screen.getByRole("listitem").textContent).toBe("typescript")
})

// Svelte tears a subscriber down one microtask after its last reader, so a re-running effect keeps it.
test("unmount aborts the request in flight", async () => {
  const requests = fakeFetch()
  const component = mount(Search, { target: document.body })

  fireEvent.click(screen.getByRole("button", { name: "Search" }))
  flushSync()
  await unmount(component)

  await vi.waitFor(() => expect(requests[0]!.signal.aborted).toBe(true))
})

test("a control follows what the machine can take", () => {
  mount(Shop, { target: document.body })
  flushSync()
  const pay = screen.getByRole("button", { name: "Pay" })
  expect(pay).toHaveProperty("disabled", true)

  fireEvent.click(screen.getByRole("button", { name: "Add" }))
  flushSync()

  expect(pay).toHaveProperty("disabled", false)
})

// Vite compiles `.svelte` files for the DOM in this environment, so the test builds the server
// version itself, next to the source so its imports resolve.
const renderCartOnServer = async (persist: Persist) => {
  const source = `${process.cwd()}/tests/adapters/Cart.svelte`
  const built = source.replace(/\.svelte$/, ".server.js")
  const { js } = compile(readFileSync(source, "utf8"), { generate: "server", filename: source })
  writeFileSync(built, js.code)
  try {
    const { default: Server } = (await import(/* @vite-ignore */ built)) as { default: Component }
    return render(Server, { props: { persist } }).body
  } finally {
    rmSync(built)
  }
}

// Svelte has no public way to tell hydration apart: it renders the saved state while hydrating and
// repairs the server's text and attributes, and the first subscriber's update re-runs the template
// once hydration is done, which fixes the `href` hydration kept. Svelte logs nothing either way, so
// `recover: false` makes a mismatch that would remount throw instead.
test("hydrating a server render keeps its nodes and ends on the saved state", async () => {
  localStorage.setItem("cart", JSON.stringify({ version: 0, state: { _tag: "cart", items: 2 } }))
  // The server has no storage.
  document.body.innerHTML = await renderCartOnServer(createPersister(undefined))
  const rendered = screen.getByRole("paragraph")
  expect(rendered.textContent).toBe("cart: 0 items")

  hydrate(Cart, {
    target: document.body,
    props: { persist: createPersister(localStorage) },
    recover: false,
  })
  flushSync()

  expect(screen.getByRole("paragraph")).toBe(rendered)
  expect(rendered.textContent).toBe("cart: 2 items")
  expect(screen.getByRole("button", { name: "Pay" })).toHaveProperty("disabled", false)
  expect(screen.getByRole("link", { name: "Share" }).getAttribute("href")).toBe("/cart?items=2")
})
