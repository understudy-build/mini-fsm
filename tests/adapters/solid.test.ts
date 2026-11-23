// @vitest-environment happy-dom
import { createRoot, flush } from "solid-js"
import { afterEach, expect, test, vi } from "vitest"

import { createMachine } from "../../src/adapters/solid.ts"
import { searchMachine } from "../search.ts"
import { fakeFetch } from "../utils.ts"

afterEach(() => {
  vi.unstubAllGlobals()
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
