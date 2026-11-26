// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { StrictMode, useMemo } from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, expect, test, vi } from "vitest"

import { useMachine } from "../../src/adapters/react.ts"
import { createPersister, type Persist } from "../../src/persist.ts"
import { searchMachine, type State } from "../search.ts"
import { CartZod, shop } from "../shop.ts"
import { fakeFetch } from "../utils.ts"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  document.body.innerHTML = ""
})

const Search = ({ initial }: { initial?: State }) => {
  const [state, send] = useMachine(searchMachine, initial)
  return (
    <div>
      <button type="button" onClick={() => send({ _tag: "search", query: "ts" })}>
        Search
      </button>
      {state._tag === "loading" && <p>Loading {state.query}</p>}
      {state._tag === "success" && (
        <ul>
          {state.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {state._tag === "failure" && <p role="alert">{state.error}</p>}
    </div>
  )
}

test("shows results after a search", async () => {
  const requests = fakeFetch()
  render(
    <StrictMode>
      <Search />
    </StrictMode>,
  )

  fireEvent.click(screen.getByRole("button", { name: "Search" }))
  expect(screen.getByText("Loading ts")).toBeTruthy()
  await act(async () => requests[0]!.respond(["typescript"]))

  expect(screen.getByRole("listitem").textContent).toBe("typescript")
  expect(requests).toHaveLength(1)
})

test("StrictMode remount aborts the first request and keeps the second", async () => {
  const requests = fakeFetch()
  render(
    <StrictMode>
      <Search initial={{ _tag: "loading", query: "ts" }} />
    </StrictMode>,
  )

  expect(requests.map((request) => request.signal.aborted)).toEqual([true, false])
  await act(async () => requests[1]!.respond(["typescript"]))

  expect(screen.getByRole("listitem").textContent).toBe("typescript")
  expect(screen.queryByRole("alert")).toBeNull()
})

const Shop = ({ log }: { log: (line: string) => void }) => {
  const cart = useMemo(() => shop(log), [log])
  const [state, send, can] = useMachine(cart)
  return (
    <div>
      <button type="button" onClick={() => send({ _tag: "add" })}>
        Add
      </button>
      <button type="button" disabled={!can({ _tag: "pay" })} onClick={() => send({ _tag: "pay" })}>
        Pay
      </button>
      <p>{state._tag}</p>
    </div>
  )
}

test("a control follows what the machine can take", () => {
  render(<Shop log={() => {}} />)
  const pay = screen.getByRole("button", { name: "Pay" })
  expect(pay).toHaveProperty("disabled", true)

  fireEvent.click(screen.getByRole("button", { name: "Add" }))

  expect(pay).toHaveProperty("disabled", false)
})

test("a machine rebuilt by `useMemo` keeps the state and runs the next step through its new handlers", () => {
  const first: Array<string> = []
  const second: Array<string> = []
  const { rerender } = render(
    <StrictMode>
      <Shop log={(line) => first.push(line)} />
    </StrictMode>,
  )
  fireEvent.click(screen.getByRole("button", { name: "Add" }))

  rerender(
    <StrictMode>
      <Shop log={(line) => second.push(line)} />
    </StrictMode>,
  )
  fireEvent.click(screen.getByRole("button", { name: "Pay" }))

  expect(screen.getByText("paying")).toBeTruthy()
  expect(first).toEqual(["toast: Added"])
  // `enter` runs through the new machine too.
  expect(second).toEqual(["toast: Paying", "track: pay", "charge"])
})

const cart = shop(() => {})

const Cart = ({ persist }: { persist: Persist }) => {
  const [state] = useMachine(cart, persist("cart", CartZod))
  return <p>{state._tag === "paid" ? "Paid" : `${state._tag}: ${state.items} items`}</p>
}

test("hydrates what the server rendered, then shows the saved state", async () => {
  localStorage.setItem("cart", JSON.stringify({ version: 0, state: { _tag: "cart", items: 2 } }))
  const container = document.createElement("div")
  // The server has no storage.
  container.innerHTML = renderToString(<Cart persist={createPersister(undefined)} />)
  document.body.append(container)
  expect(container.textContent).toBe("cart: 0 items")
  const recovered: Array<unknown> = []
  const logged = vi.spyOn(console, "error")

  const root = await act(async () =>
    hydrateRoot(container, <Cart persist={createPersister(localStorage)} />, {
      onRecoverableError: (error) => recovered.push(error),
    }),
  )

  expect(screen.getByText("cart: 2 items")).toBeTruthy()
  expect(recovered).toEqual([])
  expect(logged).not.toHaveBeenCalled()
  root.unmount()
})
