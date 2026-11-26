// @vitest-environment happy-dom
import { fireEvent, screen } from "@testing-library/dom"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, expect, test, vi } from "vitest"
import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"

import { useMachine } from "../../src/adapters/vue.ts"
import { createPersister, type Persist } from "../../src/persist.ts"
import { searchMachine } from "../search.ts"
import { CartZod, shop } from "../shop.ts"
import { fakeFetch } from "../utils.ts"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  document.body.innerHTML = ""
})

const Search = defineComponent(() => {
  const [state, send] = useMachine(searchMachine)
  return () =>
    h("div", [
      h(
        "button",
        { type: "button", onClick: () => send({ _tag: "search", query: "ts" }) },
        "Search",
      ),
      state.value._tag === "success"
        ? h(
            "ul",
            state.value.items.map((item) => h("li", item)),
          )
        : null,
    ])
})

test("shows results after a search", async () => {
  const requests = fakeFetch()
  const wrapper = mount(Search)

  await wrapper.get("button").trigger("click")
  requests[0]!.respond(["typescript"])
  await flushPromises()

  expect(wrapper.get("li").text()).toBe("typescript")
})

test("unmount aborts the request in flight", async () => {
  const requests = fakeFetch()
  const wrapper = mount(Search)

  await wrapper.get("button").trigger("click")
  wrapper.unmount()

  expect(requests[0]!.signal.aborted).toBe(true)
})

const Shop = defineComponent(() => {
  const [, send, can] = useMachine(shop(() => {}))
  return () =>
    h("div", [
      h("button", { type: "button", onClick: () => send({ _tag: "add" }) }, "Add"),
      h(
        "button",
        { type: "button", disabled: !can({ _tag: "pay" }), onClick: () => send({ _tag: "pay" }) },
        "Pay",
      ),
    ])
})

test("a control follows what the machine can take", async () => {
  mount(Shop, { attachTo: document.body })
  const pay = screen.getByRole("button", { name: "Pay" })
  expect(pay).toHaveProperty("disabled", true)

  fireEvent.click(screen.getByRole("button", { name: "Add" }))
  await flushPromises()

  expect(pay).toHaveProperty("disabled", false)
})

const cart = shop(() => {})

const Cart = (persist: Persist) =>
  defineComponent(() => {
    const [state] = useMachine(cart, persist("cart", CartZod))
    return () =>
      h(
        "p",
        state.value._tag === "paid" ? "Paid" : `${state.value._tag}: ${state.value.items} items`,
      )
  })

test("hydrates what the server rendered, then shows the saved state", async () => {
  localStorage.setItem("cart", JSON.stringify({ version: 0, state: { _tag: "cart", items: 2 } }))
  const container = document.createElement("div")
  // The server has no storage.
  container.innerHTML = await renderToString(createSSRApp(Cart(createPersister(undefined))))
  document.body.append(container)
  expect(container.textContent).toBe("cart: 0 items")
  const logged = vi.spyOn(console, "error")
  const warned = vi.spyOn(console, "warn")

  const app = createSSRApp(Cart(createPersister(localStorage)))
  app.mount(container)
  await flushPromises()

  expect(screen.getByText("cart: 2 items")).toBeTruthy()
  expect(logged).not.toHaveBeenCalled()
  expect(warned).not.toHaveBeenCalled()
  app.unmount()
})

test("a client-only mount renders the saved state from the first render", () => {
  localStorage.setItem("cart", JSON.stringify({ version: 0, state: { _tag: "cart", items: 2 } }))

  // No flush: the first render already has it.
  const wrapper = mount(Cart(createPersister(localStorage)))

  expect(wrapper.text()).toBe("cart: 2 items")
})
