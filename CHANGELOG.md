# @understudy-build/mini-fsm

## 0.2.0

### Minor Changes

- [#2](https://github.com/understudy-build/mini-fsm/pull/2) [`978b603`](https://github.com/understudy-build/mini-fsm/commit/978b6032be71edc238b2d7b191b9ee781fe24261) Thanks [@nicolastoulemont](https://github.com/nicolastoulemont)! - Breaking: `transition` returns a `Step` (`ignored`, `stayed` or `entered`) instead of the next state, so callers see an event the state doesn't handle. A same-tag update now keeps the running effect; list the events that should restart it in the state's `reenter`. A state's `catch` turns an error from `enter` into an event, and `enter` errors no longer throw out of `send`. Listeners now see every state before its effect starts, including a subscriber's first state. New `/verify` subpath: `verify(machine, { events, invariants })` sends every sample event in every reachable state and returns `verified` when every state holds the invariants, `partial` when `depth` cut the search off, or `broken` with the shortest trace that breaks one.

## 0.1.0

### Minor Changes

- [`2edec6f`](https://github.com/understudy-build/mini-fsm/commit/2edec6ffe380734cd8545fdc35741838d3a74627) Thanks [@nicolastoulemont](https://github.com/nicolastoulemont)! - First release: `machine` and `actor` over tagged unions. Each state lists the states it may move to, checked at compile time and exposed as `graph`. Adapters: `useMachine` for React and Vue, `createMachine` for Solid 2 and Svelte 5.
