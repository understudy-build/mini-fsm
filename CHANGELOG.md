# @understudy-build/mini-fsm

## 0.5.0

### Minor Changes

- [#8](https://github.com/understudy-build/mini-fsm/pull/8) [`5f4b2c9`](https://github.com/understudy-build/mini-fsm/commit/5f4b2c96957c94ac4e811660f05fbce9f565d98f) Thanks [@nicolastoulemont](https://github.com/nicolastoulemont)! - Handlers get a third argument, `after`, that queues a side effect to run once per step. `transition` stays pure: it collects the queue into `step.outputs`, and only the actor runs it, after the listeners and before the new state's `enter`. Outputs never run on restore, on subscribe, in `verify` or in `can`, and a step that throws `IllegalTransition` drops them. React's `useMachine` now runs each step and each new effect through the latest `machine`, so a factory machine rebuilt by `useMemo` keeps its state and uses its new dependencies.

  Breaking changes:

  - `machine.accepts(state, event)` becomes `machine.can(state, event)`, and the actor gains `can(event)`.
  - A guard that returns `state` gives `{ _tag: "refused", outputs }` instead of `stayed` with the same object, even for a `reenter` event. `stayed` always carries a new object. Code that compared `step.state === state` should check for `refused`.
  - `stayed` and `entered` carry `outputs`, so tests that compare a step with `toEqual` need the field.
  - Adapters return `can`: `[state, send, can]` from React, Vue and Solid, and `{ state, send, can }` from Svelte.

- [#10](https://github.com/understudy-build/mini-fsm/pull/10) [`ae33d01`](https://github.com/understudy-build/mini-fsm/commit/ae33d014f073a370172d3834063f4708ef595b5a) Thanks [@nicolastoulemont](https://github.com/nicolastoulemont)! - An actor can load its first state from a slot and save every new state to it. `actor(machine, from?)` takes a state, as before, or a `Slot` (`{ load, save }`). The actor loads the slot once, when it is created, and runs no handler, so no `after` function runs on restore; the restored state's `enter` starts on the first subscribe. Each `stayed` or `entered` step saves the committed state before the listeners run, whether or not anyone subscribes. `ignored` and `refused` steps save nothing, and a `save` that throws comes out of `send` like a listener error.

  New `/persist` subpath: `createPersister(storage, { version, discard })` returns `persist(key, schema)`, a slot over `localStorage` or any `getItem`/`setItem` storage that stores `{ version, state }` as JSON and decodes `state` on load with any Standard Schema (Zod, Valibot, ArkType, Effect Schema through `Schema.toStandardSchemaV1`). Data that isn't JSON, comes from another version or fails the schema is discarded, reported to `discard` and the actor starts from `initial`. A write that fails, such as over the quota, never comes out of `send`: the slot removes the key and reports `save` to `discard`. A schema that leaves out a final state fits its machine without a cast and makes the next visit start fresh. Without storage, as on the server, a slot loads and saves nothing. `/persist` has no runtime dependency.

  The adapters' optional second argument is now `from`: `useMachine(machine, from?)` and `createMachine(machine, from?)` take a state or a slot, read once. On the server and while hydrating, React, Vue and Solid render the state before loading, even when the slot has data on the server, and then move to the saved one, so hydration matches the server. Svelte renders what the slot loads on both sides and patches the server's markup where they differ. The Solid adapter now imports `isServer` from `@solidjs/web`, an optional peer dependency.

### Patch Changes

- [#11](https://github.com/understudy-build/mini-fsm/pull/11) [`49fe7c3`](https://github.com/understudy-build/mini-fsm/commit/49fe7c39f1cedf720cbd3b98fb5d41cb51f93011) Thanks [@nicolastoulemont](https://github.com/nicolastoulemont)! - An effect no longer outlives its last subscriber. When the last listener unsubscribed during the step that entered a state, as a "wait until `loading`, then stop" listener does, that state's `enter` still started with nobody subscribed and its `signal` never aborted. The next subscriber then started a second effect for the same state, and both could send. A step now starts the new state's effect only if someone still subscribes once its listeners and outputs have run, and a listener that subscribes during a step no longer starts the effect a second time.

## 0.4.0

### Minor Changes

- [#6](https://github.com/understudy-build/mini-fsm/pull/6) [`700f537`](https://github.com/understudy-build/mini-fsm/commit/700f537e8a0667de2e7ed05516fd1402ff36c57e) Thanks [@nicolastoulemont](https://github.com/nicolastoulemont)! - `machine.accepts(state, event)` tells whether an event would change the state: `false` when the state has no handler for it or a guard returns `state`. Use it to disable the control that sends the event instead of repeating the machine's rules in the view.

## 0.3.0

### Minor Changes

- [#4](https://github.com/understudy-build/mini-fsm/pull/4) [`03b1ecf`](https://github.com/understudy-build/mini-fsm/commit/03b1ecf3b3bd0df2d39ee45115e78e3843a41295) Thanks [@nicolastoulemont](https://github.com/nicolastoulemont)! - `verify` reports `stuck` alongside `unreached` when it returns `verified`: the reached states that list a way out in `to` but that every sample event ignores or leaves as they are, such as a `pending` state that forgot its `confirm` handler. Tests that compare a `verified` report with `toEqual` need the new field.

### Patch Changes

- [#4](https://github.com/understudy-build/mini-fsm/pull/4) [`03b1ecf`](https://github.com/understudy-build/mini-fsm/commit/03b1ecf3b3bd0df2d39ee45115e78e3843a41295) Thanks [@nicolastoulemont](https://github.com/nicolastoulemont)! - A listener or handler that throws inside an effect's `send` no longer reaches the state's `catch`. The actor reports the error as uncaught on a microtask, so a render bug can't move the machine to a failure state, and an error during a step that leaves the state is no longer dropped silently.

- [#4](https://github.com/understudy-build/mini-fsm/pull/4) [`03b1ecf`](https://github.com/understudy-build/mini-fsm/commit/03b1ecf3b3bd0df2d39ee45115e78e3843a41295) Thanks [@nicolastoulemont](https://github.com/nicolastoulemont)! - `verify` takes its event type from the machine, so inline sample events such as `events: [{ _tag: "start" }, { _tag: "fail" }]` typecheck instead of widening to `{ _tag: string }`.

- [#4](https://github.com/understudy-build/mini-fsm/pull/4) [`03b1ecf`](https://github.com/understudy-build/mini-fsm/commit/03b1ecf3b3bd0df2d39ee45115e78e3843a41295) Thanks [@nicolastoulemont](https://github.com/nicolastoulemont)! - `verify` compares states as JSON with sorted keys, so `{ _tag, level }` and `{ level, _tag }` count as one state instead of two, and the `states` count no longer depends on how a handler orders its keys.

## 0.2.0

### Minor Changes

- [#2](https://github.com/understudy-build/mini-fsm/pull/2) [`978b603`](https://github.com/understudy-build/mini-fsm/commit/978b6032be71edc238b2d7b191b9ee781fe24261) Thanks [@nicolastoulemont](https://github.com/nicolastoulemont)! - Breaking: `transition` returns a `Step` (`ignored`, `stayed` or `entered`) instead of the next state, so callers see an event the state doesn't handle. A same-tag update now keeps the running effect; list the events that should restart it in the state's `reenter`. A state's `catch` turns an error from `enter` into an event, and `enter` errors no longer throw out of `send`. Listeners now see every state before its effect starts, including a subscriber's first state. New `/verify` subpath: `verify(machine, { events, invariants })` sends every sample event in every reachable state and returns `verified` when every state holds the invariants, `partial` when `depth` cut the search off, or `broken` with the shortest trace that breaks one.

## 0.1.0

### Minor Changes

- [`2edec6f`](https://github.com/understudy-build/mini-fsm/commit/2edec6ffe380734cd8545fdc35741838d3a74627) Thanks [@nicolastoulemont](https://github.com/nicolastoulemont)! - First release: `machine` and `actor` over tagged unions. Each state lists the states it may move to, checked at compile time and exposed as `graph`. Adapters: `useMachine` for React and Vue, `createMachine` for Solid 2 and Svelte 5.
