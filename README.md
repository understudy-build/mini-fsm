# @understudy-build/mini-fsm

A finite state machine over TypeScript tagged unions, in 963 bytes minified (569 gzipped). States and events are plain objects with a `_tag`; each handler sees only the state and event variants it handles, and each state lists the states it may move to.

Adapters for React, Vue, Solid 2 and Svelte 5 live at subpaths. Node and Svelte stores need none.

## Quick start

```sh
pnpm add @understudy-build/mini-fsm
# or
bun add @understudy-build/mini-fsm
```

```ts
import { machine } from "@understudy-build/mini-fsm"

type State =
  | { readonly _tag: "idle" }
  | { readonly _tag: "loading"; readonly query: string }
  | { readonly _tag: "success"; readonly query: string; readonly items: ReadonlyArray<string> }
  | { readonly _tag: "failure"; readonly query: string; readonly error: string }

type Event =
  | { readonly _tag: "search"; readonly query: string }
  | { readonly _tag: "resolve"; readonly items: ReadonlyArray<string> }
  | { readonly _tag: "reject"; readonly error: string }

// Shared across states, so it names the one state it returns.
const search = (
  _: State,
  event: Extract<Event, { _tag: "search" }>,
): Extract<State, { _tag: "loading" }> => ({ _tag: "loading", query: event.query })

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
      enter: async (state, { send, signal }) => {
        try {
          const response = await fetch(`/search?q=${encodeURIComponent(state.query)}`, { signal })
          // parseItems is your decoder: response.json() is untyped data.
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
```

`machine<State, Event>()` is curried: you name `State` and `Event`, and TypeScript infers the graph from each `to`.

## Transitions

Each state's `to` lists the other states it may move to. Staying in the same tag is always allowed, so `loading` handles a second `search` without listing itself, and a guard returns `state` to ignore an event. `to: []` marks a final state.

The build fails when:

- `states` misses a tag in `State`, or names one that isn't in it
- `to` names a state that doesn't exist
- a handler returns a state its `to` doesn't list
- a handler names an unknown event

A handler shared across states has to name the state it returns, as `search` does above. Typed as returning `State`, it fails in every state whose `to` doesn't list every state.

At runtime, `searchMachine.graph` holds the same map, `{ idle: ["loading"], loading: ["success", "failure"], ... }`, typed with its literal tags. Use it to mark final states (`graph[state._tag].length === 0`), draw the machine, or check in a test that every state is reachable. It lists moves, not the events that cause them.

A handler the compiler can't check, through a cast or plain JavaScript, can still return a state its `to` doesn't list. `transition` then throws `IllegalTransition`, with `from` and `to`.

Effect's `Schema.TaggedStruct` and `Data.TaggedEnum` produce `_tag`, so decoded values go straight into `send`.

## Frameworks

### React

```tsx
import type { Machine, Tagged } from "@understudy-build/mini-fsm"
import { useMachine } from "@understudy-build/mini-fsm/react"

const Search = () => {
  const [state, send] = useMachine(searchMachine)

  return (
    <>
      <button onClick={() => send({ _tag: "search", query: "ts" })}>Search</button>
      {state._tag === "success" && state.items.map((item) => <li key={item}>{item}</li>)}
      <Steps machine={searchMachine} current={state._tag} />
    </>
  )
}

// Every state, its exits, and where the user is now.
const Steps = <S extends Tagged, E extends Tagged>(props: {
  machine: Machine<S, E>
  current: S["_tag"]
}) => (
  <ol aria-label="Steps">
    {Object.entries<ReadonlyArray<string>>(props.machine.graph).map(([tag, to]) => (
      <li key={tag} aria-current={tag === props.current ? "step" : undefined}>
        {tag} → {to.length === 0 ? "done" : to.join(", ")}
      </li>
    ))}
  </ol>
)
```

`useMachine(machine, initial?)` reads `initial` once, like `useState`.

### Vue

```vue
<script setup lang="ts">
import { useMachine } from "@understudy-build/mini-fsm/vue"

const [state, send] = useMachine(searchMachine)
</script>

<template>
  <button @click="send({ _tag: 'search', query: 'ts' })">Search</button>
  <ul v-if="state._tag === 'success'">
    <li v-for="item in state.items" :key="item">{{ item }}</li>
  </ul>
</template>
```

`state` is a `ShallowRef`. Effects start on mount.

### Solid

```tsx
import { createMachine } from "@understudy-build/mini-fsm/solid"

const Search = () => {
  const [state, send] = createMachine(searchMachine)
  // state() is an accessor
}
```

Needs Solid 2. Effects start once the component settles.

### Svelte

```svelte
<script lang="ts">
  import { createMachine } from "@understudy-build/mini-fsm/svelte"

  const search = createMachine(searchMachine)
</script>

<button onclick={() => search.send({ _tag: "search", query: "ts" })}>Search</button>
{#if search.state._tag === "success"}
  {#each search.state.items as item (item)}<li>{item}</li>{/each}
{/if}
```

Needs Svelte 5.7. Read `search.state`; destructuring it copies one value and loses reactivity. Effects run while a template or `$effect` reads `state`. With stores, use `actor(searchMachine)` and `$search`.

### Node

```ts
import { actor } from "@understudy-build/mini-fsm"

const order = actor(orderMachine, saved)
const stop = order.subscribe((state) => console.log(state._tag))
order.send({ _tag: "pay" })
```

For a workflow you persist, skip the actor: `orderMachine.transition(saved, event)` is pure and returns the next state to save.

## How it runs

- `send` with an event the current state doesn't handle returns the same state object, and listeners don't run.
- A handler that leaves the graph throws `IllegalTransition` out of `send` and `transition`, and the state stays as it was.
- `enter` runs when the machine enters a state value and its `signal` aborts when it leaves. A new value with the same tag counts as leaving: a second `search` while `loading` aborts the first request.
- After `signal` aborts, `send` from that effect does nothing, so a late response can't land.
- Effects run only while someone subscribes. The first subscriber starts the current state's effect; the last unsubscribe aborts it. An actor nobody subscribes to does nothing, which keeps React StrictMode and server rendering free of side effects.
- A `send` from inside an effect or a listener waits until the current step finishes, so listeners see every state in order.
- A rejected `enter` surfaces as an unhandled rejection. Catch errors and send them as events.

There is no context, nesting or parallel states. Data lives on the state variant.

## API

| Export                         | Signature                                                           |
| ------------------------------ | ------------------------------------------------------------------- |
| `machine<State, Event>()(def)` | `{ initial, graph, transition(state, event), enter(state, scope) }` |
| `actor(machine, initial?)`     | `{ get(), send(event), subscribe(listener) }`, a Svelte store       |
| `IllegalTransition`            | `Error` with `_tag`, `from` and `to`                                |
| `/react` `useMachine`          | `[state, send]`                                                     |
| `/vue` `useMachine`            | `[ShallowRef<state>, send]`                                         |
| `/solid` `createMachine`       | `[() => state, send]`                                               |
| `/svelte` `createMachine`      | `{ state, send }`                                                   |

Each adapter adds 40 to 80 bytes minified on top of `actor`.

## Licence

MIT
