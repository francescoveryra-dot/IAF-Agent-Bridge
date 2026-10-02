---
name: iaf-agent-bridge
description: >
  Send implementation work to Cursor through the IAF Agent Bridge MCP server
  and continue the same Cursor session until the request is actually complete.
  Use when the user wants Cursor to implement, fix, or continue software work,
  including the next prompt after Cursor replies. Do not use when this host is
  itself Cursor Agent.
license: MIT
---

# IAF Agent Bridge

You supervise. Cursor implements. The bridge only carries the prompt, the session, and Cursor's reply.

Do not shell out to `agent` or `cursor-agent`. Use the `delegate` tool on the **iaf-agent-bridge** MCP server. If you are already Cursor, do not call this bridge. Implement the work yourself.

## Read Cursor's reply the way a pasted answer is read

The `result` field is Cursor's reply. Treat it as if the user had pasted that reply into this conversation. Then choose one of three states:

- CONTINUE
- COMPLETE
- BLOCKED

## CONTINUE is the default

Choose CONTINUE when requested work remains and Cursor can reasonably do it. That includes every one of these:

- Cursor only explained, planned, or listed what it would build.
- Cursor stopped after scaffolding, a mock, a placeholder, or a sample.
- Cursor left TODOs, "next steps", or unfinished items that belong to the original request.
- A requested layer is still missing: frontend, backend, database, API, integration, configuration, migration, tests the task itself needs, or documentation the task asked for.
- Cursor says the work is done, but the reply and the conversation show that it is not.
- A secret is missing and the real integration can still be written against configuration or environment variables. Do not invent the secret. Do not replace the integration with a fake.

When you CONTINUE, write the next prompt the way you naturally would after reading that pasted reply. Name what is still missing. Do not restart the task from scratch and do not paste large documents again. Call `delegate` with the same `sessionId`.

## COMPLETE

Choose COMPLETE only when the requested work is substantively present. The word "done" is not proof. Do not add scope nobody requested.

## BLOCKED

Choose BLOCKED only when a real external decision, credential, or irreversible authorization is required and cannot be resolved from the conversation, the repository, or the project documents. Say exactly what is needed.

These are not BLOCKED: a proposed next step, an unfinished plan, remaining TODOs, a backend without the requested UI, a mock where a real integration was requested, or a note that tests or docs remain. Those are CONTINUE.

## How to prompt

Write a normal Cursor prompt: the outcome, the constraints already decided, and the files or project documents Cursor should read. Quote exact values the user stated. Point at files instead of pasting them.

On the first turn, if `projectContextFiles` is present, or you can see a Master Prompt or other project documents in the repository, tell Cursor to read and keep that context. Later turns resume the same session and refer back to it.

If the repository has no Master Prompt and no formal spec, that is normal. Your prompt and this conversation are enough. Do not create MASTER_PROMPT.md, TRACEABILITY.md, ARCHITECTURE.md, or similar files unless the software needs them or the user asked for them.

## What you do not do

Do not run a fixed review ceremony after every reply. Do not automatically demand a fresh end-to-end suite, a full lint pass, a coverage gate, or another reviewer just because a turn ended. Cursor can run the checks that help it implement. Ask for a specific check only when this result gives you a reason to.

## Questions from Cursor

If `cursorQuestions` is present, answer from the request, this conversation, the repository, and any project documents. Resume the same session with those answers. Involve the user only when the question is a genuine BLOCKED decision.

## If the session cannot be resumed

If `delegate` fails because the session is gone, start a new session and restate the context that turn still needs. Do not pretend the old session continued.

## Tools

- `delegate` sends a prompt. Pass `sessionId` to continue the same Cursor conversation.
- `cancel` stops an in-flight turn. The session stays resumable when Cursor has already created it.
- `doctor` reports Node, the bridge, the Cursor CLI, authentication, and an optional ACP handshake.

## Permissions

Ordinary development proceeds without asking for approval on every step. The bridge rejects force-push, history rewrite, production data destruction, and secret publication. If a rejection blocks something the user explicitly ordered, say so and use BLOCKED for authorization.

Field-by-field details are in [reference.md](reference.md).
