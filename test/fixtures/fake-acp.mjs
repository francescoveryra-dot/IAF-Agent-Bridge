import readline from "node:readline";

const script = process.env.FAKE_ACP_SCRIPT || "stream";
const command = process.env.FAKE_ACP_COMMAND || "npm test";

if (process.argv.includes("--version")) {
  process.stdout.write("9.9.9-test\n");
  process.exit(0);
}
if (process.argv.includes("status")) {
  process.stdout.write(`${JSON.stringify({ isAuthenticated: true, status: "authenticated" })}\n`);
  process.exit(0);
}

process.stderr.write("fake-acp diagnostic\n");

const rl = readline.createInterface({ input: process.stdin });
const waiters = new Map();
let nextId = 1;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ask(method, params) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve) => waiters.set(id, resolve));
}

function permissionParams() {
  return {
    sessionId: "session-test",
    toolCall: { toolCallId: "call-1", title: command, kind: "execute", rawInput: { command } },
    options: [
      { optionId: "allow-once", kind: "allow_once", name: "Allow once" },
      { optionId: "allow-always", kind: "allow_always", name: "Allow always" },
      { optionId: "reject-once", kind: "reject_once", name: "Reject" },
    ],
  };
}

async function finishPrompt(id, promptMessage) {
  const blocks = Array.isArray(promptMessage?.params?.prompt) ? promptMessage.params.prompt : [];
  const attached = blocks.some((block) => block?.type === "resource_link" || block?.type === "image");
  if (script === "hang") return;
  if (script === "exit") process.exit(2);
  if (script === "malformed") process.stdout.write("this is not json\n");
  if (script === "permission") {
    const response = await ask("session/request_permission", permissionParams());
    const optionId = response?.result?.outcome?.optionId;
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `decision:${optionId}` } } },
    });
  } else if (script === "question") {
    await ask("cursor/ask_question", {
      toolCallId: "q-1",
      title: "Need input",
      questions: [{
        id: "q1",
        prompt: "Which database?",
        options: [{ id: "postgres", label: "PostgreSQL" }, { id: "sqlite", label: "SQLite" }],
      }],
    });
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Question left for the supervisor." } } },
    });
  } else if (script === "plan") {
    await ask("cursor/create_plan", {
      name: "Build the app",
      overview: "Implement the requested app.",
      plan: "1. Create the server.",
      todos: [{ id: "t1", content: "Create the server", status: "pending" }],
    });
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Plan ready." } } },
    });
  } else if (script === "todos") {
    send({
      jsonrpc: "2.0",
      method: "cursor/update_todos",
      params: {
        merge: false,
        todos: [
          { id: "1", content: "Write the handler", status: "completed" },
          { id: "2", content: "Cover the edge case", status: "pending" },
        ],
      },
    });
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        update: {
          sessionUpdate: "tool_call_update",
          locations: [{ path: "src/app.ts" }],
          content: [{ type: "diff", path: "src/app.ts" }],
        },
      },
    });
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Handler added." } } },
    });
  } else {
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: attached ? "attached Hello from Cursor" : "Hello from Cursor" } } },
    });
  }
  send({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } });
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.method === undefined && message.id !== undefined) {
    waiters.get(message.id)?.(message);
    waiters.delete(message.id);
    return;
  }
  if (message.method === "session/cancel") return;
  if (message.id === undefined) return;
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: { loadSession: true },
        authMethods: [{ id: "cursor_login", name: "Cursor Login" }],
      },
    });
    return;
  }
  if (message.method === "authenticate") {
    if (script === "auth-fail") {
      send({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "login required" } });
      return;
    }
    send({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "session/load") {
    if (script === "load-fail" || message.params?.sessionId === "missing") {
      send({ jsonrpc: "2.0", id: message.id, error: { code: -32002, message: "session not found" } });
      return;
    }
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: message.params.sessionId, models: { currentModelId: "composer" } } });
    return;
  }
  if (message.method === "session/new") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        sessionId: "session-test",
        models: {
          currentModelId: "composer",
          availableModels: [{ modelId: "composer" }, { modelId: "other" }],
        },
        modes: { availableModes: [{ id: "agent" }, { id: "plan" }, { id: "ask" }] },
        configOptions: [
          { id: "fast", options: [{ value: "true" }, { value: "false" }] },
          { id: "effort", name: "Thinking", options: [{ value: "low" }, { value: "high" }] },
          { id: "context", options: [{ value: "272k" }, { value: "1m" }] },
        ],
      },
    });
    return;
  }
  if (message.method === "session/set_mode" || message.method === "session/set_model" || message.method === "session/set_config_option" || message.method === "session/close") {
    if (message.method === "session/set_model" && message.params?.modelId === "nope") {
      send({ jsonrpc: "2.0", id: message.id, error: { code: -32602, message: "unknown model nope" } });
      return;
    }
    if (message.method === "session/set_config_option" && message.params?.configId === "context" && message.params?.value === "bad") {
      send({ jsonrpc: "2.0", id: message.id, error: { code: -32602, message: "unknown context bad" } });
      return;
    }
    send({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "session/prompt") void finishPrompt(message.id, message);
});
