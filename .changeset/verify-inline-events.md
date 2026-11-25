---
"@understudy-build/mini-fsm": patch
---

`verify` takes its event type from the machine, so inline sample events such as `events: [{ _tag: "start" }, { _tag: "fail" }]` typecheck instead of widening to `{ _tag: string }`.
