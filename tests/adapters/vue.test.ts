// @vitest-environment happy-dom
import { fireEvent, screen } from "@testing-library/dom"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, expect, test, vi } from "vitest"
import { defineComponent, h } from "vue"

import { useMachine } from "../../src/adapters/vue.ts"
import { searchMachine } from "../search.ts"
import { shop } from "../shop.ts"
import { fakeFetch } from "../utils.ts"

afterEach(() => {
  vi.unstubAllGlobals()
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
