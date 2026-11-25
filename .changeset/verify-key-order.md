---
"@understudy-build/mini-fsm": patch
---

`verify` compares states as JSON with sorted keys, so `{ _tag, level }` and `{ level, _tag }` count as one state instead of two, and the `states` count no longer depends on how a handler orders its keys.
