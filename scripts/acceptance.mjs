import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTurn } from "../dist/turn.js";

const root = join(tmpdir(), `iaf-accept-${Date.now()}`);
mkdirSync(root, { recursive: true });
const evidence = [];

function note(name, detail) {
  evidence.push({ name, ...detail });
  process.stdout.write(`\n## ${name}\n${JSON.stringify(detail, null, 2)}\n`);
}

async function delegate(workspace, prompt, sessionId) {
  return runTurn({
    prompt,
    workspace,
    sessionId,
    mode: "agent",
    turnTimeoutMs: 180_000,
    handshakeTimeoutMs: 30_000,
  });
}

try {
  const simple = join(root, "simple");
  mkdirSync(simple);
  const first = await delegate(simple, "Create hello.txt containing exactly hello. Do not create any other files.");
  const invented = ["MASTER_PROMPT.md", "PROJECT_SPEC.md", "TRACEABILITY.md", "ARCHITECTURE.md"].filter((name) => existsSync(join(simple, name)));
  note("simple-project", {
    sessionId: first.sessionId,
    projectContextFiles: first.projectContextFiles ?? [],
    hello: existsSync(join(simple, "hello.txt")),
    invented,
    stopReason: first.stopReason ?? null,
  });

  const structured = join(root, "structured");
  mkdirSync(structured);
  writeFileSync(join(structured, "MASTER_PROMPT.md"), "# Deliverables\n\n1. Create alpha.txt containing alpha.\n2. Create beta.txt containing beta.\n\nDo not create PROJECT_SPEC.md or TRACEABILITY.md.\n");
  const detected = await delegate(
    structured,
    "Read MASTER_PROMPT.md and implement only the first deliverable, alpha.txt. Stop before beta.txt.",
  );
  const followed = await delegate(
    structured,
    "The first deliverable is present. Finish the remaining deliverable from MASTER_PROMPT.md: create beta.txt containing beta. Do not create PROJECT_SPEC.md or TRACEABILITY.md.",
    detected.sessionId,
  );
  note("master-prompt", {
    firstSession: detected.sessionId,
    secondSession: followed.sessionId,
    sameSession: detected.sessionId === followed.sessionId,
    resumed: followed.resumed,
    context: detected.projectContextFiles ?? [],
    alpha: existsSync(join(structured, "alpha.txt")),
    beta: existsSync(join(structured, "beta.txt")),
    inventedSpec: existsSync(join(structured, "PROJECT_SPEC.md")) || existsSync(join(structured, "TRACEABILITY.md")),
  });

  const loop = join(root, "loop");
  mkdirSync(loop);
  const layerOne = await delegate(
    loop,
    "Create src/math.js that exports add(a, b). Do not add multiply yet.",
  );
  const layerTwo = await delegate(
    loop,
    "add exists. The requested module is still incomplete. Add multiply(a, b) to the same src/math.js and keep add.",
    layerOne.sessionId,
  );
  const source = existsSync(join(loop, "src", "math.js")) ? readFileSync(join(loop, "src", "math.js"), "utf8") : "";
  note("natural-loop", {
    firstSession: layerOne.sessionId,
    secondSession: layerTwo.sessionId,
    sameSession: layerOne.sessionId === layerTwo.sessionId,
    resumed: layerTwo.resumed,
    hasAdd: /function add|exports\.add|const add/.test(source),
    hasMultiply: /function multiply|exports\.multiply|const multiply/.test(source),
  });

  const failed = evidence.filter((item) => {
    if (item.name === "simple-project") return !item.hello || item.invented.length > 0;
    if (item.name === "master-prompt") return !item.sameSession || !item.resumed || !item.alpha || !item.beta || item.inventedSpec || !(item.context ?? []).includes("MASTER_PROMPT.md");
    if (item.name === "natural-loop") return !item.sameSession || !item.resumed || !item.hasAdd || !item.hasMultiply;
    return false;
  });
  if (failed.length) process.exitCode = 1;
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exitCode = 1;
} finally {
  rmSync(root, { recursive: true, force: true });
}
