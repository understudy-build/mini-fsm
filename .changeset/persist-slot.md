---
"@understudy-build/mini-fsm": minor
---

An actor can load its first state from a slot and save every new state to it. `actor(machine, from?)` takes a state, as before, or a `Slot` (`{ load, save }`). The actor loads the slot once, when it is created, and runs no handler, so no `after` function runs on restore; the restored state's `enter` starts on the first subscribe. Each `stayed` or `entered` step saves the committed state before the listeners run, whether or not anyone subscribes. `ignored` and `refused` steps save nothing, and a `save` that throws comes out of `send` like a listener error.

New `/persist` subpath: `createPersister(storage, { version, discard })` returns `persist(key, schema)`, a slot over `localStorage` or any `getItem`/`setItem` storage that stores `{ version, state }` as JSON and decodes `state` on load with any Standard Schema (Zod, Valibot, ArkType, Effect Schema through `Schema.toStandardSchemaV1`). Data that isn't JSON, comes from another version or fails the schema is discarded, reported to `discard` and the actor starts from `initial`. A schema that leaves out a final state fits its machine without a cast and makes the next visit start fresh. Without storage, as on the server, a slot loads and saves nothing. `/persist` has no runtime dependency.

The adapters' optional second argument is now `from`: `useMachine(machine, from?)` and `createMachine(machine, from?)` take a state or a slot, read once. While hydrating a server render, React, Vue and Solid render the state before loading and then move to the saved one, so hydration matches the server. Svelte renders the saved state and patches the server's markup.
