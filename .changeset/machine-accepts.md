---
"@understudy-build/mini-fsm": minor
---

`machine.accepts(state, event)` tells whether an event would change the state: `false` when the state has no handler for it or a guard returns `state`. Use it to disable the control that sends the event instead of repeating the machine's rules in the view.
