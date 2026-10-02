# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x on `main` | yes |
| older tags | none yet; 1.0.0 has not been cut as a GitHub Release |

## What to report privately

Report privately when the issue could let someone:

- run commands or edit files outside the workspace the caller named;
- bypass the destructive-action guard without `IAF_PERMISSION_MODE=allow-all`;
- steal Cursor credentials, tokens, or private file contents through logs or tool results;
- make Cursor delegate to itself in a loop that the existing refusal does not stop;
- compromise the npm package, a plugin hook, or a GitHub Actions workflow.

## What not to put in a public issue

Do not include tokens, passwords, private keys, `.env` contents, customer data, or a proof of concept that drops or exfiltrates data. Use a private advisory instead.

Ordinary bugs and feature requests belong in [Issues](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/issues).

## How to report

Open a private advisory:

https://github.com/francescoveryra-dot/IAF-Agent-Bridge/security/advisories/new

Include the version or commit, the host, what you expected, and the smallest description that shows the problem. Redact secrets.

There is no public security email. Private vulnerability reporting is enabled on this repository.

## What to expect

The maintainer will acknowledge a report when they can. There is no published response-time promise. Fixes land on `main` with a changelog note. Credit is given when you want it.

## Scope

In scope: this repository's MCP server, ACP client, permission policy, plugin hooks, and GitHub workflows.

Out of scope: Cursor's own service, the supervisor product you use (Codex, Claude, and others), and vulnerabilities that require the operator to set `IAF_PERMISSION_MODE=allow-all` or to point `IAF_CURSOR_AGENT` at a program they do not trust.

Dependency advisories are handled with Dependabot. If you find a dependency issue that Dependabot has not opened, use a private advisory when it is exploitable from this bridge.

## Operational boundaries

`delegate` starts Cursor in a directory you choose. Treat that directory as writable. `plan` and `ask` are instructions to Cursor, not a sandbox. Logs are redacted for common token shapes and are not a guarantee. The child process inherits the environment so Cursor can use its existing login.
