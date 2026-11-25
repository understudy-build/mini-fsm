# @understudy-build/mini-fsm

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
