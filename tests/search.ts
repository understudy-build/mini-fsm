import { machine } from "../src/index.ts"

export type State =
  | { readonly _tag: "idle" }
  | { readonly _tag: "loading"; readonly query: string }
  | { readonly _tag: "success"; readonly query: string; readonly items: ReadonlyArray<string> }
  | { readonly _tag: "failure"; readonly query: string; readonly error: string }

export type Event =
  | { readonly _tag: "search"; readonly query: string }
  | { readonly _tag: "resolve"; readonly items: ReadonlyArray<string> }
  | { readonly _tag: "reject"; readonly error: string }

const parseItems = (json: unknown): ReadonlyArray<string> => {
  if (Array.isArray(json) && json.every((item) => typeof item === "string")) return json
  throw new Error("Malformed response")
}

// Shared across states, so it names the one state it returns.
const search = (
  _: State,
  event: Extract<Event, { _tag: "search" }>,
): Extract<State, { _tag: "loading" }> => ({
  _tag: "loading",
  query: event.query,
})

export const searchMachine = machine<State, Event>()({
  initial: { _tag: "idle" },
  states: {
    idle: { to: ["loading"], on: { search } },
    loading: {
      to: ["success", "failure"],
      on: {
        search,
        resolve: (state, event) => ({ _tag: "success", query: state.query, items: event.items }),
        reject: (state, event) => ({ _tag: "failure", query: state.query, error: event.error }),
      },
      // Leaving `loading` aborts the request, and the `reject` it causes is dropped.
      enter: async (state, { send, signal }) => {
        try {
          const response = await fetch(`/search?q=${encodeURIComponent(state.query)}`, { signal })
          send({ _tag: "resolve", items: parseItems(await response.json()) })
        } catch (error) {
          send({ _tag: "reject", error: String(error) })
        }
      },
    },
    success: { to: ["loading"], on: { search } },
    failure: { to: ["loading"], on: { search } },
  },
})
