# Remote Chat proof of concept

Normal ChatGPT Chat does not launch the local stdio server. A remote supervisor has to call a streamable HTTP MCP server. This document is the proof of concept for that path. It is not the installed local plugin, and it is not a public endpoint.

## Decision

ChatGPT Sites is not the transport. [Hosting a plugin with ChatGPT Sites](https://help.openai.com/en/articles/20001547-hosting-a-plugin-with-chatgpt-sites) lets ChatGPT or Codex add an MCP server whose tools read and update that Site. The server runs with the Site. It does not open an outbound connection from this Mac, and it does not speak Cursor ACP.

The viable shape is a remote MCP gateway plus a local connector:

```
normal ChatGPT Chat
        |  streamable HTTP MCP, bearer token
        v
IAF gateway  (loopback in this proof of concept)
        |  outbound poll from the Mac
        v
IAF connector
        |  existing delegate / Cursor ACP
        v
Cursor parent turn
        |
        v
unchanged result back to the same ChatGPT tool call
```

The gateway does not call an LLM and does not write the next prompt. ChatGPT remains the supervisor. The connector accepts a `projectId` and resolves it through a local allowlist. A filesystem path in the tool call is rejected.

## What ChatGPT can call

[ChatGPT Developer mode](https://developers.openai.com/api/docs/guides/developer-mode) is the supported way to attach a remote MCP server to ChatGPT. It is available to Plus, Pro, Business, Enterprise, and Education accounts on the web. The connector speaks SSE or streamable HTTP. Write tools require confirmation unless the user remembers an approval for that conversation.

[Build an MCP server](https://developers.openai.com/plugins/build/mcp-server) requires a public HTTPS `/mcp` endpoint for a submitted plugin. [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) can reach a private server without inbound ports, including from a developer-mode app. The tunnel client needs a Platform API key (`CONTROL_PLANE_API_KEY`) and a `tunnel_id`. That key is a control-plane credential, not a supervisor model call. This repository does not create one. The tunnel does not satisfy public plugin submission.

The Help Center article [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461) still says full write MCP is in beta for Business, Enterprise, and Edu, and that Pro accounts are limited to read or fetch. The developer-mode guide says write tools are available on Plus and Pro as well. Those two OpenAI pages disagree. A personal account has to be tested before `delegate` can be assumed to run.

Official pages do not state a numeric limit for repeated MCP calls inside one ChatGPT turn, and they do not state the tool-call timeout. A blocking `delegate` is the proof-of-concept tool because that is the same parent-turn wait the local bridge already uses. If a live ChatGPT call is cut off, the next change is a job id that ChatGPT polls. That polling is not implemented here, because the timeout is not in the official docs and has not been measured on this account.

Quota for normal Chat plus a remote MCP tool is not stated. Treat it as unmeasured.

## Run the loopback proof

Use two different tokens. Do not pass them on the command line.

```shell
export IAF_GATEWAY_CHAT_TOKEN='replace-with-a-long-random-token'
export IAF_GATEWAY_CONNECTOR_TOKEN='replace-with-a-different-long-random-token'
export IAF_GATEWAY_URL='http://127.0.0.1:8787'
export IAF_REMOTE_PROJECTS='demo=/absolute/path/to/a/temporary/project'
iaf-agent-bridge gateway
```

In another shell, with the same connector token, gateway URL, and project list:

```shell
iaf-agent-bridge connector
```

The gateway listens on `127.0.0.1` only. ChatGPT cannot reach that address. Reaching normal Chat requires either a TLS endpoint you choose to publish, or Secure MCP Tunnel after you create the Platform credential. Neither is started by these commands.

## Threats

| Threat | Mitigation in this proof | Still open |
| --- | --- | --- |
| Anonymous caller reaches Cursor | Separate bearer tokens for ChatGPT and the connector. Wrong or missing tokens get 401. | Tokens are shared secrets. A stolen ChatGPT token can request delegate until it is rotated. |
| Path traversal | `projectId` is a short name. The connector maps it to an allowlisted directory. | The allowlist is local configuration. A wrong entry is still a directory Cursor can edit. |
| Replay of a finished call | The same `clientRequestId` returns the stored result and does not start another turn. | A connector crash after Cursor has started, but before the result is posted, can leave the gateway waiting until its deadline. A later new request can run the work again. |
| Two turns in one Cursor session | The gateway rejects a second `delegate` for a session that is still running. | Two sessions can still run one after another on this connector. |
| Oversized body | MCP and result posts are capped. An oversized Cursor result is replaced by an explicit error, not a summary. | The cap is a limit, not a review of the content. |
| Prompt injection from the repository | The gateway forwards Cursor's reply unchanged. | ChatGPT can still obey hostile text inside that reply. Confirmation of write tools is the product control. |
| Public scanning | The proof binds to loopback. | A later hosted gateway needs TLS, the bearer check, rate limits, and no anonymous route to Cursor. |
| Gateway restart | Jobs live in memory. | A restart drops running calls. Cursor may still finish locally. |
| Secret leakage | Logs record job and project ids, not prompts or tokens. Tool results omit the local workspace path. | Doctor output can still include the local Cursor executable path, as the local doctor does. |

No OpenAI inference API is called. `OPENAI_API_KEY` is not read.
