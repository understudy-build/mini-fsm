---
"@understudy-build/mini-fsm": minor
---

`verify` reports `stuck` alongside `unreached` when it returns `verified`: the reached states that list a way out in `to` but that every sample event ignores or leaves as they are, such as a `pending` state that forgot its `confirm` handler. Tests that compare a `verified` report with `toEqual` need the new field.
