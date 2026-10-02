---
description: Stop an in-flight Cursor turn without forgetting the session.
---

Call `cancel` with the `sessionId` from `delegate`. Use `force: true` only when the turn is still running after the first cancel. A finished turn is `not-running` and can still be resumed.
