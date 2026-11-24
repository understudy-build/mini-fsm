---
"@understudy-build/mini-fsm": minor
---

Breaking: `transition` returns a `Step` (`ignored`, `stayed` or `entered`) instead of the next state, so callers see an event the state doesn't handle. A same-tag update now keeps the running effect; list the events that should restart it in the state's `reenter`. A state's `catch` turns an error from `enter` into an event, and `enter` errors no longer throw out of `send`. Listeners now see every state before its effect starts, including a subscriber's first state. New `/verify` subpath: `verify(machine, { events, invariants })` sends every sample event in every reachable state and returns `verified` when every state holds the invariants, `partial` when `depth` cut the search off, or `broken` with the shortest trace that breaks one.
