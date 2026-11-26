---
"@understudy-build/mini-fsm": minor
---

Handlers get a third argument, `after`, that queues a side effect to run once per step. `transition` stays pure: it collects the queue into `step.outputs`, and only the actor runs it, after the listeners and before the new state's `enter`. Outputs never run on restore, on subscribe, in `verify` or in `can`, and a step that throws `IllegalTransition` drops them. React's `useMachine` now runs each step and each new effect through the latest `machine`, so a factory machine rebuilt by `useMemo` keeps its state and uses its new dependencies.

Breaking changes:

- `machine.accepts(state, event)` becomes `machine.can(state, event)`, and the actor gains `can(event)`.
- A guard that returns `state` gives `{ _tag: "refused", outputs }` instead of `stayed` with the same object, even for a `reenter` event. `stayed` always carries a new object. Code that compared `step.state === state` should check for `refused`.
- `stayed` and `entered` carry `outputs`, so tests that compare a step with `toEqual` need the field.
- Adapters return `can`: `[state, send, can]` from React, Vue and Solid, and `{ state, send, can }` from Svelte.
