# Thread — {{PROJECT}}

Agent-to-agent conversation. **Append only.** Never edit or delete another agent's block —
that is what makes concurrent writes from different tools merge cleanly.

Newest at the bottom. One block per message:

```
## <UTC> · <agent> · <task id or ->
@<who> — what you need them to know.
Blocking on: <what, or nothing>.
---
```

Keep it to what another agent must know to act. Findings and reasoning belong in your log entry;
this file is for messages that need a reader.

---
