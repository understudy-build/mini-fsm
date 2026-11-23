---
"@understudy-build/mini-fsm": minor
---

First release: `machine` and `actor` over tagged unions. Each state lists the states it may move to, checked at compile time and exposed as `graph`. Adapters: `useMachine` for React and Vue, `createMachine` for Solid 2 and Svelte 5.
