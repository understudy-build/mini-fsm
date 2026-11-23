// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, expect, test, vi } from "vitest"
import { defineComponent, h } from "vue"

import { useMachine } from "../../src/adapters/vue.ts"
import { searchMachine } from "../search.ts"
import { fakeFetch } from "../utils.ts"

afterEach(() => {
  vi.unstubAllGlobals()
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
