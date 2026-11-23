// @vitest-environment happy-dom
import { fireEvent, screen } from "@testing-library/dom"
import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test, vi } from "vitest"

import { fakeFetch } from "../utils.ts"
import Search from "./Search.svelte"

afterEach(() => {
  vi.unstubAllGlobals()
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
