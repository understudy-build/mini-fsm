---
"@understudy-build/mini-fsm": patch
---

A listener or handler that throws inside an effect's `send` no longer reaches the state's `catch`. The actor reports the error as uncaught on a microtask, so a render bug can't move the machine to a failure state, and an error during a step that leaves the state is no longer dropped silently.
