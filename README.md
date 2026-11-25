<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.svg">
    <img alt="" src="docs/images/logo.svg" width="88">
  </picture>
  <br>
  mini-fsm
</h1>

A finite state machine over TypeScript tagged unions, in 1.4 kB minified (0.8 kB gzipped). States and events are plain objects with a `_tag`; each handler sees only the state and event variants it handles, and each state lists the states it may move to.

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
      // A new query restarts the request.
      reenter: ["search"],
      enter: async (state, { send, signal }) => {
        const response = await fetch(`/search?q=${encodeURIComponent(state.query)}`, { signal })
        // parseItems is your decoder: response.json() is untyped data.
        send({ _tag: "resolve", items: parseItems(await response.json()) })
      },
      catch: (error) => ({ _tag: "reject", error: String(error) }),
    },
    success: { to: ["loading"], on: { search } },
    failure: { to: ["loading"], on: { search } },
  },
})
```

`machine<State, Event>()` is curried: you name `State` and `Event`, and TypeScript infers the graph from each `to`.

## Transitions

Each state's `to` lists the other states it may move to. Staying in the same tag is always allowed, so `loading` handles a second `search` without listing itself, and a guard returns `state` to stay as it is. `to: []` marks a final state.

The build fails when:

- `states` misses a tag in `State`, or names one that isn't in it
- `to` names a state that doesn't exist
- a handler returns a state its `to` doesn't list
- a handler names an unknown event

A handler shared across states has to name the state it returns, as `search` does above. Typed as returning `State`, it fails in every state whose `to` doesn't list every state.

At runtime, `searchMachine.graph` holds the same map, `{ idle: ["loading"], loading: ["success", "failure"], ... }`, typed with its literal tags. Use it to mark final states (`graph[state._tag].length === 0`), draw the machine, or check in a test that every state is reachable. It lists moves, not the events that cause them.

`transition(state, event)` is pure and returns a `Step`:

| Step                         | When                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| `{ _tag: "ignored" }`        | the state has no handler for the event                                |
| `{ _tag: "stayed", state }`  | the handler kept the tag; the running effect keeps running            |
| `{ _tag: "entered", state }` | the handler changed the tag, or the event is in the state's `reenter` |

A guard that returns `state` gives `stayed` with the same object, so "no handler" and "the guard said no" stay apart.

A handler the compiler can't check, through a cast or plain JavaScript, can still return a state its `to` doesn't list. `transition` then throws `IllegalTransition`, with `from` and `to`.

Effect's `Schema.TaggedStruct` and `Data.TaggedEnum` produce `_tag`, so decoded values go straight into `send`.

## Effects

`enter` runs when the machine enters a state, and its `signal` aborts when it leaves. Data that changes while the effect runs stays on the same tag, and the effect keeps running. List the events that should restart it in `reenter`. `catch` turns an error the effect throws or rejects with into an event.

```ts
uploading: {
  to: ["idle", "failed", "done"],
  on: {
    choose,
    // Same tag, not in `reenter`: the upload keeps running.
    progress: (state, event) => ({ ...state, percent: event.percent }),
    finish: (state, event) => ({ _tag: "done", file: state.file, url: event.url }),
    fail: (state, event) => ({ _tag: "failed", file: state.file, error: event.error }),
    cancel: () => ({ _tag: "idle" }),
  },
  // A new file replaces the upload in flight: abort it and start again.
  reenter: ["choose"],
  enter: async (state, { send, signal }) => {
    const url = await post(state.file, {
      signal,
      progress: (percent) => send({ _tag: "progress", percent }),
    })
    send({ _tag: "finish", url })
  },
  catch: (error) => ({
    _tag: "fail",
    error: error instanceof Error ? error.message : String(error),
  }),
},
```

Without `catch`, an error from `enter` surfaces as an unhandled rejection. It never throws out of `send`. An error from a listener or handler during the effect's `send`, such as a render bug, is reported as an uncaught error and never reaches `catch`, so it can't move the machine to a failure state.

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

### Persisted workflows

For a workflow you save to a database, skip the actor and call `transition`. It makes each step correct, but two requests that load the same row can both pass. Guard the write with a version column, and queue the new state's work in the same transaction:

```ts
const step = orderMachine.transition(row.state, event)
if (step._tag === "ignored")
  return Result.fail(new Ignored({ state: row.state._tag, event: event._tag }))

await db.transaction(async (tx) => {
  const saved = await tx
    .update(orders)
    .set({ state: step.state, version: row.version + 1 })
    .where(and(eq(orders.id, id), eq(orders.version, row.version)))
  if (saved.rowCount === 0) throw new Conflict() // reload and retry
  if (step._tag === "entered") await tx.insert(outbox).values({ orderId: id, state: step.state })
})
```

A runtime with one writer per key, such as Restate virtual objects, Effect Cluster entities or Durable Objects, makes the version check unnecessary.

## How it runs

- `send` with an event the current state doesn't handle does nothing, and listeners don't run. Use `transition` when you need to know.
- A handler that leaves the graph throws `IllegalTransition` out of `send` and `transition`, and the state stays as it was.
- A step aborts the old effect, commits the state, runs the listeners, then starts the new effect. Listeners see each state before its effect can move on, and a throwing listener can't stop the effect from starting.
- After `signal` aborts, `send` and errors from that effect are dropped, so a late response or an `AbortError` can't land.
- Effects run only while someone subscribes. A new subscriber sees the current state first; the first subscriber then starts its effect, and the last unsubscribe aborts it. An actor nobody subscribes to does nothing, which keeps React StrictMode and server rendering free of side effects.
- A `send` from inside an effect or a listener waits until the current step finishes, so listeners see every state in order.
- An error from `enter`, thrown or rejected, goes to the state's `catch`, or else surfaces as an unhandled rejection. A listener or handler that throws inside an effect's `send` is reported on a microtask instead, so it can't reach `catch`.

There is no context, nesting or parallel states. Data lives on the state variant.

## Verifying

`verify` from `/verify` sends every sample event you give it in every state the machine can reach, breadth first. Any event may arrive in any state, as it can from a network.

```ts
import { verify } from "@understudy-build/mini-fsm/verify"

const report = verify(jobMachine, {
  events: [{ _tag: "start" }, { _tag: "fail" }, { _tag: "retry" }],
  invariants: { "at most 3 attempts": (job) => !("attempt" in job) || job.attempt <= 3 },
})
```

| Report                                           | Means                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `{ _tag: "verified", states, unreached, stuck }` | every reachable state holds every invariant                                |
| `{ _tag: "partial", states, depth }`             | nothing broke, but the search hit `depth` (12) with states left; raise it  |
| `{ _tag: "broken", invariant, initial, trace }`  | `trace` is the shortest list of `{ event, state }` that breaks `invariant` |

`verified` holds for the events you pass: a rule that depends on a payload is only tried with the payloads you list. `unreached` lists the states none of them reach: a dead state, or a missing sample event. `stuck` lists the reached states that name a way out in `to` but that every sample event leaves as they are, such as a `pending` state with no handler for `confirm`. States are compared as JSON with sorted keys unless you pass `key`. `verify` covers one machine; races between several actors or a database need a model of the whole system, in TLA+ or Quint.

## API

| Export                               | Signature                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `machine<State, Event>()(def)`       | `{ initial, graph, transition(state, event) => Step, enter(state, scope) }` |
| `actor(machine, initial?)`           | `{ get(), send(event), subscribe(listener) }`, a Svelte store               |
| `IllegalTransition`                  | `Error` with `_tag`, `from` and `to`                                        |
| `/verify` `verify(machine, options)` | `{ _tag: "verified" \| "partial" \| "broken", ... }`                        |
| `/react` `useMachine`                | `[state, send]`                                                             |
| `/vue` `useMachine`                  | `[ShallowRef<state>, send]`                                                 |
| `/solid` `createMachine`             | `[() => state, send]`                                                       |
| `/svelte` `createMachine`            | `{ state, send }`                                                           |

Each adapter adds 40 to 80 bytes minified on top of `actor`. `/verify` is 1.2 kB minified and stays out of bundles that don't import it.

## Licence

MIT
