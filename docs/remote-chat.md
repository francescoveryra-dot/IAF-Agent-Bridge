# Personal Private ChatGPT

Normal ChatGPT Chat does not launch the local stdio server used by Codex, Work, Claude Code, or Copilot. Those hosts stay on that local server. Normal Chat uses a separate path that stays on the user's computer.

The architectural claim is narrow. ChatGPT and OpenAI process the conversation because ChatGPT is the supervisor. IAF infrastructure is not in that path: IAF does not receive, proxy, or store the prompts, Cursor replies, source, paths, or credentials. This is not a claim that no third party can see the content.

## Personal Private

```
normal ChatGPT Chat
        |  the user's own Secure MCP Tunnel
        v
tunnel-client on the user's computer
        |  Unix socket, mode 600
        v
local IAF MCP server
        |  existing Bridge / Cursor ACP
        v
Cursor on the same computer
        |
        v
Cursor's parent-turn result back to that ChatGPT tool call
```

There is no IAF account, IAF API key, or IAF-hosted gateway. The local process calls Cursor directly. It does not generate the next prompt. macOS and Linux listen on a mode 600 Unix socket. Windows uses loopback TCP because that platform does not provide the same socket permission. Neither mode listens on a public address.

`tunnel-client` can dial Streamable HTTP on this machine. The documented form is a channel-qualified URL with `unix-socket`. See [tunnel-client configuration](https://github.com/openai/tunnel-client/blob/master/docs/configuration.md). A second MCP bearer is not required for this socket: other operating-system users cannot connect to a mode `600` socket, and the public internet cannot connect to it. A bearer pasted into ChatGPT would travel through OpenAI with the forwarded `Authorization` header, so Personal Private does not ask for one. TCP loopback remains available only as an explicit test listener because other local users can reach `127.0.0.1`.

The OpenAI tunnel service does queue the MCP request and the tool result. That is OpenAI's path, not IAF's. [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) describes it. `tunnel-client` also bounds a downstream call by `MCP_CONNECTION_MAX_TTL`, which defaults to 10 minutes. A longer Cursor turn can be cut off there. Job polling is not part of this release.

## What each party holds

| Secret | Where it lives | IAF receives it |
| --- | --- | --- |
| `CONTROL_PLANE_API_KEY` | The user's shell, for `tunnel-client` | No |
| `tunnel_id` | Platform tunnel settings and the user's shell | No |
| Cursor credentials | The local Cursor CLI | No |
| Project directories | The local config file, mode `600` | No |

`tunnel-client` reads the runtime key from the environment. That is the official mechanism. This bridge does not copy it into Keychain, a repository, or an IAF service. Creating the key, leaving the tunnel open, and tunnel poll traffic have no published price. The Responses API MCP tool bills tokens; this mode does not call that API.

## Setup

```shell
npx iaf-agent-bridge setup chatgpt --project demo=/absolute/path/to/one/project
npx iaf-agent-bridge chatgpt
```

`setup` checks the local Cursor CLI, stores the canonical directory for each alias, and refuses the filesystem root and the home directory. ChatGPT later sends only the alias, such as `demo`. If that directory is replaced by a symlink to somewhere else, delegate fails closed.

The command does not create an OpenAI key. After `chatgpt` is running, the remaining account steps are:

1. Create a tunnel at [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels) for the ChatGPT workspace you will use.
2. Create a Restricted runtime key at [Platform API keys](https://platform.openai.com/settings/organization/api-keys) with Tunnels Read and Use only. Export it as `CONTROL_PLANE_API_KEY`. Do not paste it into ChatGPT.
3. Run official `tunnel-client` with `CONTROL_PLANE_TUNNEL_ID` and `--mcp.server-url "channel=main,url=http://127.0.0.1/mcp,unix-socket=SOCKET"`, using the socket path printed by `chatgpt`.
4. On chatgpt.com, turn on Developer mode under Settings, Security and login. In Plugins, add an app, choose Tunnel, and select that tunnel. Use a new normal Chat, not Work or Codex.

`delegate` stays a write tool. OpenAI's developer-mode guide and the Help Center still disagree about Plus and Pro write access. If the plan refuses write tools, relabeling `delegate` as read-only is not a fix.

A public ChatGPT directory listing requires a public HTTPS MCP endpoint. Pointing that endpoint at IAF would put IAF on the content path, so this product is distributed through npm and GitHub instead. Each user attaches their own tunnel.

## Other profiles

Enterprise self-hosted is the same shape inside the customer's network: their tunnel or gateway, their bridge, their Cursor. IAF still is not on the content path. No enterprise service is built here.

An IAF-hosted relay is not implemented. It would be considered only if a later design kept plaintext content and decryption keys off IAF infrastructure. That design does not exist.

## Logging

There is no IAF telemetry. Info logs record a job id, the project alias, and durations. They do not record prompts, Cursor replies, paths, or credentials.

## Threats the bridge controls

Internet clients cannot open the socket. Another local account cannot open a mode `600` socket. ChatGPT cannot pass a filesystem path; aliases are checked again on each call, including after a symlink swap. A repeated `clientRequestId` does not start a second turn. A second delegate for a session that is still running is rejected. Oversized results are not forwarded. Logs and doctor results omit paths and secrets.

## Threats outside this process

A stolen tunnel runtime key lets someone else poll that user's tunnel until the key is revoked. OpenAI can see the MCP payloads because the tunnel service queues them. A malicious repository or Cursor reply can try to steer ChatGPT. A process running as the same user can talk to the socket and can also read the user's files. Those are OpenAI, Cursor, and operating-system boundaries.
