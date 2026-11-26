---
"@understudy-build/mini-fsm": patch
---

An effect no longer outlives its last subscriber. When the last listener unsubscribed during the step that entered a state, as a "wait until `loading`, then stop" listener does, that state's `enter` still started with nobody subscribed and its `signal` never aborted. The next subscriber then started a second effect for the same state, and both could send. A step now starts the new state's effect only if someone still subscribes once its listeners and outputs have run, and a listener that subscribes during a step no longer starts the effect a second time.
