# Intentional differences

IAF Agent Bridge was designed from the behavior of public Cursor ACP clients and from the current Cursor ACP documentation. It is not a fork of those clients.

These differences are deliberate:

- The supervisor decides CONTINUE, COMPLETE, or BLOCKED. The bridge does not require a diff review, a fresh test run, or an end-to-end suite after every turn.
- Follow-up work resumes the same Cursor session. A missing session is an error, not a silent new session.
- Ordinary permissions are allowed automatically. Force-push, history rewrite, production-style destructive SQL, secret staging, and deletes outside the workspace are rejected.
- Cursor questions are returned to the supervisor instead of blocking on a person. Plan requests are accepted in agent mode so implementation continues, and captured without implementation in plan mode.
- The tool argument is `prompt`, not a separate brief schema. The prompt is sent as written.
- V1 has one production executor, Cursor, behind a small registry.
- The package is not published to npm. Configuration examples use `node dist/cli.js`.
- Diagnostics omit Cursor account identity.
