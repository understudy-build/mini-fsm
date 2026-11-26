<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.svg">
    <img alt="" src="docs/images/logo.svg" width="88">
  </picture>
  <br>
  mini-fsm
</h1>

A finite state machine over TypeScript tagged unions, in 1.7 kB minified (0.89 kB gzipped). States and events are plain objects with a `_tag`; each handler sees only the state and event variants it handles, and each state lists the states it may move to.

Adapters for React, Vue, Solid 2 and Svelte 5 live at subpaths. Node and Svelte stores need none. `/persist` saves an actor's state to `localStorage` and decodes it on reload with any Standard Schema.

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

Each state's `to` lists the other states it may move to. Staying in the same tag is always allowed, so `loading` handles a second `search` without listing itself, and a guard returns `state` to refuse the event. `to: []` marks a final state.

The build fails when:

- `states` misses a tag in `State`, or names one that isn't in it
- `to` names a state that doesn't exist
- a handler returns a state its `to` doesn't list
- a handler names an unknown event

A handler shared across states has to name the state it returns, as `search` does above. Typed as returning `State`, it fails in every state whose `to` doesn't list every state.

At runtime, `searchMachine.graph` holds the same map, `{ idle: ["loading"], loading: ["success", "failure"], ... }`, typed with its literal tags. Use it to mark final states (`graph[state._tag].length === 0`), draw the machine, or check in a test that every state is reachable. It lists moves, not the events that cause them.

`transition(state, event)` is pure and returns a `Step`:

| Step                                  | When                                                                  |
| ------------------------------------- | --------------------------------------------------------------------- |
| `{ _tag: "ignored" }`                 | the state has no handler for the event                                |
| `{ _tag: "refused", outputs }`        | a guard returned `state`, even for a `reenter` event                  |
| `{ _tag: "stayed", state, outputs }`  | the handler kept the tag; the running effect keeps running            |
| `{ _tag: "entered", state, outputs }` | the handler changed the tag, or the event is in the state's `reenter` |

`stayed` always carries a new object, so "no handler", "the guard said no" and "the data changed" stay apart. `outputs` holds the side effects the handler queued with `after`, described under [Effects](#effects); `transition` never runs them.

`can(state, event)` asks whether the event would change the state. It is `false` when the step is `ignored` or `refused`, so a control can disable itself from the machine's own rules instead of repeating them:

```tsx
const pay = { _tag: "pay" } as const

// Disabled in every state without a `pay` handler, and wherever its guard says no.
<button disabled={!orderMachine.can(state, pay)} onClick={() => send(pay)}>
  Pay
</button>
```

`can` runs the handler and throws its outputs away, so it never triggers a side effect, and it throws `IllegalTransition` like `transition`. The adapters return a `can` bound to the current state.

A disabled control never sends its event, so its guard never runs. When the user should learn why they can't do something, keep the control enabled and let the guard explain itself with an output:

```ts
pay: (state, _, after) => {
  if (state.items.length === 0) {
    after(() => toast("Your cart is empty"))
    return state // refused: no new state, but the toast runs
  }
  return { _tag: "paying", items: state.items }
},
```

Pick one per control: a `pay` button that `can` disables never shows this toast.

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

Without `catch`, an error from `enter` surfaces as an unhandled rejection. It never throws out of `send`. An error from a listener, handler or output during the effect's `send`, such as a render bug, is reported as an uncaught error and never reaches `catch`, so it can't move the machine to a failure state.

### Side effects that run once per step

`enter` runs every time the machine arrives in a state, including when an actor starts from a restored state, so it suits work that belongs to the state, such as a request. A side effect that belongs to one step, such as a toast, an analytics event or a focus change, goes through the handler's third argument, `after`:

```ts
const cartMachine = ({ toast, track }: Deps) =>
  machine<Cart, CartEvent>()({
    initial: { _tag: "cart", items: [] },
    states: {
      cart: {
        to: ["paying"],
        on: {
          add: (state, event, after) => {
            after(() => toast(`Added ${event.item}`))
            return { ...state, items: [...state.items, event.item] }
          },
          pay: (state, _, after) => {
            after(() => track("pay", { items: state.items.length }))
            return { _tag: "paying", items: state.items }
          },
        },
      },
      // ...
    },
  })
```

`after` only queues the function. `transition` collects the queue into `step.outputs` and stays pure, so `verify` can explore every state and `can` can run during render without firing a toast. The actor runs the outputs once per `send`, in the order queued, after the listeners have seen the new state and before the new state's `enter` starts. They never run on restore, on subscribe, in `verify` or in `can`, and a step that throws `IllegalTransition` drops them. Calling `after` once its handler has returned throws.

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

`useMachine(machine, from?)` returns `[state, send, can]` and reads `from`, a state or a [slot](#persisting-state), once, like `useState`. Each step and each new effect runs through the latest `machine`, so a factory machine that `useMemo` rebuilds when a dependency changes keeps its state and uses the new dependency from the next step on. An effect that is already running keeps the closure it started with.

```tsx
const cart = useMemo(() => cartMachine({ toast, track }), [toast, track])
const [state, send, can] = useMachine(cart)

<button disabled={!can({ _tag: "pay" })} onClick={() => send({ _tag: "pay" })}>Pay</button>
```

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

`useMachine` returns `[state, send, can]`. `state` is a `ShallowRef`, and `can` reads `state.value`, so a template or `computed` that calls it updates with the machine. Effects start on mount.

### Solid

```tsx
import { createMachine } from "@understudy-build/mini-fsm/solid"

const Search = () => {
  const [state, send, can] = createMachine(searchMachine)
  // state() is an accessor; can(event) reads it, so it tracks too
}
```

Needs Solid 2 and `@solidjs/web`. Effects start once the component settles.

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

Needs Svelte 5.7. Read `search.state`; destructuring it copies one value and loses reactivity. `search.can(event)` tracks the machine like `state` does. Effects run while a template or `$effect` reads `state` or calls `can`. With stores, use `actor(searchMachine)` and `$search`.

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
if (step._tag === "ignored" || step._tag === "refused")
  return Result.fail(new Rejected({ step: step._tag, state: row.state._tag, event: event._tag }))

await db.transaction(async (tx) => {
  const saved = await tx
    .update(orders)
    .set({ state: step.state, version: row.version + 1 })
    .where(and(eq(orders.id, id), eq(orders.version, row.version)))
  if (saved.rowCount === 0) throw new Conflict() // reload and retry
  if (step._tag === "entered") await tx.insert(outbox).values({ orderId: id, state: step.state })
})
for (const run of step.outputs) run()
```

Run `step.outputs` once the transaction commits, so a conflict that rolls the step back sends no email.

A runtime with one writer per key, such as Restate virtual objects, Effect Cluster entities or Durable Objects, makes the version check unnecessary.

## Persisting state

`actor(machine, from)` takes a state or a slot, `{ load, save }`, and so do the adapters. The actor loads the slot once, when it is created, and saves each new state inside the step, whether or not anyone subscribes. `/persist` builds slots over Web Storage:

```ts
import { createPersister } from "@understudy-build/mini-fsm/persist"

// Node 25 has a `localStorage` that every request would share, so check for `window`.
const persist = createPersister(typeof window === "undefined" ? undefined : localStorage, {
  version: 1,
  discard: (key, reason) => console.warn(`Dropped the saved ${key}: ${reason._tag}`),
})

const cart = actor(cartMachine, persist("cart", CartSchema))
```

Each key holds `{ version, state }` as JSON. Saved data is untrusted input, so the slot decodes `state` with the key's schema before it reaches `transition`. It throws the data away when it isn't JSON (`json`), when another `version` wrote it or it has no envelope (`version`, with the one `found`), or when the schema rejects it (`invalid`, with the schema's `issues`). The actor then starts from `machine.initial`, and `discard` hears why. A missing key starts from `initial` too, without calling `discard`. Bump `version` when old data would decode into the wrong thing; there is no migration step.

The schema is any [Standard Schema](https://standardschema.dev): Zod, Valibot, ArkType, or Effect Schema through `Schema.toStandardSchemaV1`. It also decides what a reload may resume. Leave a final state out and the next visit starts fresh:

```ts
import { z } from "zod"

// `paid` is left out: a finished order starts a new cart.
const CartSchema = z.discriminatedUnion("_tag", [
  z.object({ _tag: z.literal("cart"), items: z.array(z.string()) }),
  z.object({ _tag: z.literal("paying"), items: z.array(z.string()), attempt: z.string() }),
])
```

```ts
import { Schema } from "effect"

const CartSchema = Schema.toStandardSchemaV1(
  Schema.Union([
    Schema.TaggedStruct("cart", { items: Schema.Array(Schema.String) }),
    Schema.TaggedStruct("paying", { items: Schema.Array(Schema.String), attempt: Schema.String }),
  ]),
)
```

A persister's slot loads what the schema decodes and saves any state, so a schema that covers part of `State` passes to `actor` and the adapters without a cast. `paid` is still saved; the next load rejects it, reports `invalid` and starts from `initial`. A schema that decodes a state the machine doesn't have fails the build.

The schema must be synchronous: `load` throws an error naming the key when `validate` returns a Promise. A `validate` that throws is a bug and comes out of `load`. States must survive `JSON.stringify`, so keep `Date`, `Map` and class instances out of them. The schema decodes what `JSON.stringify` wrote, so its encoded form must be the state itself: a schema that parses numbers from strings, such as Effect's `Schema.NumberFromString`, never restores. Without storage, as on the server, a slot loads nothing and saves nothing.

A write that fails, such as `localStorage` over its quota, never comes out of `send`: the step goes on and the view keeps up. The slot removes the key, so the next visit starts fresh instead of resuming an older state, and `discard` hears `save` with the error. A hand-built slot whose `save` throws follows the listener rule instead: the error comes out of `send`, the listeners and outputs left don't run, and `enter` still starts.

### What runs on restore

Restoring runs no handler, so no `after` function runs: the `track("pay")` call from the step that reached `paying` doesn't fire again. `enter` does run again, on the first subscribe, as it does for any actor created from a given state. A restored `paying` state starts its charge again, so carry an idempotency key in the state and send it with the request. Make the key where the event is sent, so `transition` stays pure:

```ts
// In the view: send({ _tag: "pay", attempt: crypto.randomUUID() })
pay: (state, event) => ({ _tag: "paying", items: state.items, attempt: event.attempt }),

paying: {
  to: ["paid"],
  on: { confirm: () => ({ _tag: "paid" }) },
  enter: async (state, { send, signal }) => {
    // The server charges once per key, however many times this runs.
    await fetch("/charge", { method: "POST", headers: { "Idempotency-Key": state.attempt }, signal })
    send({ _tag: "confirm" })
  },
},
```

### One actor per key

Two actors on one key each save their own state, and the last write wins. The actor doesn't follow writes from elsewhere, such as another tab. Create one actor per key and share what it returns; in React, through context:

```tsx
const slot = persist("cart", CartSchema)
const CartContext = createContext<ReturnType<typeof useMachine<Cart, CartEvent>> | null>(null)

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const cart = useMachine(cartMachine, slot)
  return <CartContext value={cart}>{children}</CartContext>
}

export const useCart = () => {
  const cart = use(CartContext)
  if (!cart) throw new Error("useCart needs a CartProvider")
  return cart
}
```

### Async backends

`load` is synchronous, because an actor needs its first state when it is created. For IndexedDB, a server or React Native's AsyncStorage, read before rendering, then hand the actor a slot you build:

```ts
import type { Slot } from "@understudy-build/mini-fsm"
import { get, set } from "idb-keyval"

const saved = CartSchema.safeParse(await get("cart"))
const slot: Slot<Cart> = {
  load: () => (saved.success ? saved.data : undefined),
  save: (state) => void set("cart", state).catch(report),
}
```

The actor doesn't await `save`, so handle its rejection in the slot; otherwise it goes unhandled.

### Server rendering

The server renders the state before loading, `from` when it's a state and `machine.initial` otherwise, even when its slot has data, such as a cookie slot or Node's own `localStorage`. React, Vue and Solid render that state while hydrating too, so hydration matches the server, then move to the saved state:

| Adapter | On the server and while hydrating                                                               |
| ------- | ----------------------------------------------------------------------------------------------- |
| React   | `getServerSnapshot` returns the state before loading; React then renders with the saved one     |
| Vue     | `state` is the state before loading, and moves to the saved one on mount                        |
| Solid   | `state` is the state before loading under `isServer` or `isHydrating()`, until it settles       |
| Svelte  | renders what the slot loads; the client repairs the server's text and attributes if they differ |

Svelte has no public way to tell the server or hydration apart, so its adapter renders what the slot loads on both sides. With no storage on the server, Svelte keeps the server's nodes and patches them in place. A page that renders without hydrating shows the saved state from its first render in every adapter.

## How it runs

- `send` with an event the current state doesn't handle does nothing, and listeners don't run. Use `transition` when you need to know.
- A refused step runs its outputs, but commits nothing, notifies no listener and leaves the effect running.
- A handler that leaves the graph throws `IllegalTransition` out of `send` and `transition`, the state stays as it was, and its outputs never run.
- An actor created from a slot loads it once and runs no handler, so no output runs on restore.
- A step aborts the old effect, commits the state, saves it to the slot, runs the listeners, runs the outputs in the order queued, then starts the new effect. Listeners see each state before its effect can move on. The first `save`, listener or output that throws stops the ones left and comes out of `send`, but the effect still starts. `ignored` and `refused` steps save nothing.
- After `signal` aborts, `send` and errors from that effect are dropped, so a late response or an `AbortError` can't land.
- Effects run only while someone subscribes. A new subscriber sees the current state first; the first subscriber then starts its effect, and the last unsubscribe aborts it. An actor nobody subscribes to does nothing, which keeps React StrictMode and server rendering free of side effects.
- A `send` from inside an effect, a listener or an output waits until the current step finishes, its `enter` included, so listeners see every state in order.
- An error from `enter`, thrown or rejected, goes to the state's `catch`, or else surfaces as an unhandled rejection. A listener, handler or output that throws inside an effect's `send` is reported on a microtask instead, so it can't reach `catch`.

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

`verified` holds for the events you pass: a rule that depends on a payload is only tried with the payloads you list. `unreached` lists the states none of them reach: a dead state, or a missing sample event. `stuck` lists the reached states that name a way out in `to` but that every sample event leaves as they are, such as a `pending` state with no handler for `confirm`. An ignored event, a refused one, and a new object with the same content all leave a state as it is. States are compared as JSON with sorted keys unless you pass `key`. `verify` covers one machine; races between several actors or a database need a model of the whole system, in TLA+ or Quint.

## API

| Export                                          | Signature                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `machine<State, Event>()(def)`                  | `{ initial, graph, transition(state, event) => Step, can(state, event), enter(state, scope) }`           |
| handler                                         | `(state, event, after) => state`; `after(run)` queues `run` for once the step commits                    |
| `actor(machine, from?)`                         | `{ get(), send(event), can(event), subscribe(listener) }`, a Svelte store; `from` is a state or a `Slot` |
| `Slot<State>`                                   | `{ load() => State \| undefined, save(state) }`                                                          |
| `IllegalTransition`                             | `Error` with `_tag`, `from` and `to`                                                                     |
| `/persist` `createPersister(storage, options?)` | `(key, schema) => Slot`; options `version` (`0`) and `discard(key, reason)`                              |
| `/verify` `verify(machine, options)`            | `{ _tag: "verified" \| "partial" \| "broken", ... }`                                                     |
| `/react` `useMachine(machine, from?)`           | `[state, send, can]`                                                                                     |
| `/vue` `useMachine(machine, from?)`             | `[ShallowRef<state>, send, can]`                                                                         |
| `/solid` `createMachine(machine, from?)`        | `[() => state, send, can]`                                                                               |
| `/svelte` `createMachine(machine, from?)`       | `{ state, send, can }`                                                                                   |

Each adapter adds 240 to 430 bytes minified on top of `actor`, React the most because it forwards each step to the latest machine. `/persist` is 0.6 kB minified and `/verify` 1.2 kB; each stays out of bundles that don't import it, and `/persist` has no runtime dependency.

## Licence

MIT
