# Supervisor loop

The supervisor reads `result` as a pasted Cursor reply and chooses one state.

`delegate` does not return when Cursor first writes something that sounds finished. It returns after that Cursor turn has stopped: implementation, tools, sub-agents, review, and follow-up work included, as far as Cursor's own turn boundary goes. The bridge does not decide that the work is done. It only waits until Cursor's parent turn is terminal, then hands you the reply. A second `delegate` for a session that is still running is rejected. Start the follow-up after the result arrives.

## CONTINUE

Requested work remains and Cursor can still do it. That includes a plan, a TODO list, a mock, a missing layer, or a claim of completion that the reply does not support. Call `delegate` again with the same `sessionId` and a prompt that names what is left.

## COMPLETE

The requested work is present. Do not add scope nobody asked for.

## BLOCKED

A person must supply a decision, a secret, or authorization for an irreversible action. Say what is needed.

The bridge does not insert a lint, end-to-end, or coverage requirement after every turn. Ask for a check when that result needs it.

## Project documents

On the first result, `projectContextFiles` lists these files when they exist at the workspace root:

`MASTER_PROMPT.md`, `PROJECT_SPEC.md`, `ENVIRONMENT.md`, `ARCHITECTURE.md`, `PLAN.md`, `TRACEABILITY.md`.

Tell Cursor to read them once. Later prompts stay on the same session. If none of the files exist, the bridge does not create them.

## Questions

`cursorQuestions` holds a question Cursor asked during the turn. Answer it in the next prompt on the same session when the answer is in the conversation or the repository. Ask the user only when the question is a real BLOCKED decision.
