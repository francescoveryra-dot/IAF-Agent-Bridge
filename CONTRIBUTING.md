# Contributing

Issues and pull requests are welcome on [IAF-Agent-Bridge](https://github.com/francescoveryra-dot/IAF-Agent-Bridge).

```shell
npm install
npm test
npm run typecheck
npm run build
```

`npm test` compiles TypeScript and runs the Node test runner. The tests use a fake ACP process. They do not call Cursor.

A live check, when you are logged in with `agent login`:

```shell
node scripts/cursor-smoke.mjs
```

That script sends one short prompt in a temporary directory. It can create a Cursor session and spend a request.

Keep the supervisor skill focused on CONTINUE, COMPLETE, and BLOCKED. Do not add a mandatory test, lint, or end-to-end gate to the skill.

Do not commit `.env` files, tokens, or a copy of another project's source.
