---
description: Send the current request to Cursor through IAF Agent Bridge and continue that session while work remains.
---

Use the `delegate` tool. Read `result` as Cursor's reply. If requested work remains, call `delegate` again with the same `sessionId`. Choose CONTINUE, COMPLETE, or BLOCKED as described in the iaf-agent-bridge skill. Do not shell out to the Cursor CLI.
