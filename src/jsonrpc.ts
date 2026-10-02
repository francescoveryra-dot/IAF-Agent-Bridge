import { StringDecoder } from "node:string_decoder";
import type { Readable, Writable } from "node:stream";
import { BridgeError } from "./errors.js";

export type JsonRpcId = number | string;

interface PendingCall {
  method: string;
  resolve: (value: unknown) => void;
  reject: (err: BridgeError) => void;
  timer?: NodeJS.Timeout;
}

export interface JsonRpcPeerHandlers {
  onRequest: (id: JsonRpcId, method: string, params: unknown) => void;
  onNotification: (method: string, params: unknown) => void;
  onActivity?: () => void;
  onMalformed?: (detail: string) => void;
}

const MAX_BUFFER = 8_000_000;

export class JsonRpcPeer {
  malformedFrames = 0;
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, PendingCall>();
  private buffer = "";
  private readonly decoder = new StringDecoder("utf8");
  private closed = false;

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
    private readonly handlers: JsonRpcPeerHandlers,
  ) {
    input.on("data", (chunk: Buffer | string) => this.consume(typeof chunk === "string" ? chunk : this.decoder.write(chunk)));
    input.on("end", () => this.consume(this.decoder.end()));
    input.on("error", () => {});
    output.on("error", () => {});
  }

  request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (this.closed) return Promise.reject(new BridgeError("connection-closed", "The ACP connection is closed."));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeError("rpc-timeout", `ACP method ${method} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  respond(id: JsonRpcId, result: unknown): void {
    this.send({ jsonrpc: "2.0", id, result });
  }

  respondError(id: JsonRpcId, code: number, message: string): void {
    this.send({ jsonrpc: "2.0", id, error: { code, message } });
  }

  rejectAll(err: BridgeError): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(err);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.rejectAll(new BridgeError("connection-closed", "The ACP connection closed."));
    this.input.removeAllListeners("data");
  }

  private send(payload: unknown): void {
    if (this.closed) return;
    try {
      this.output.write(`${JSON.stringify(payload)}\n`);
    } catch {
      // A closed pipe is reported on the stream. It must not crash the MCP server.
    }
  }

  private consume(text: string): void {
    if (!text) return;
    this.buffer += text;
    if (this.buffer.length > MAX_BUFFER && !this.buffer.includes("\n")) {
      this.buffer = "";
      this.noteMalformed("ACP frame exceeded the size limit");
      return;
    }
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      if (line.trim()) this.handleLine(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    this.handlers.onActivity?.();
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.noteMalformed("ACP frame was not valid JSON");
      return;
    }
    const record = message && typeof message === "object" ? (message as Record<string, unknown>) : null;
    if (!record) {
      this.noteMalformed("ACP frame was not an object");
      return;
    }
    const hasId = Object.prototype.hasOwnProperty.call(record, "id") && record.id !== null && record.id !== undefined;
    const method = typeof record.method === "string" ? record.method : undefined;
    if (method && hasId) {
      this.handlers.onRequest(record.id as JsonRpcId, method, record.params);
      return;
    }
    if (method) {
      this.handlers.onNotification(method, record.params);
      return;
    }
    if (!hasId) {
      this.noteMalformed("ACP frame had no method or id");
      return;
    }
    const pending = this.pending.get(record.id as JsonRpcId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(record.id as JsonRpcId);
    if ("error" in record && record.error) {
      const error = record.error as { code?: number; message?: string };
      pending.reject(new BridgeError("rpc-error", error.message || `ACP method ${pending.method} failed.`, {
        rpcCode: typeof error.code === "number" ? error.code : undefined,
      }));
      return;
    }
    pending.resolve(record.result);
  }

  private noteMalformed(detail: string): void {
    this.malformedFrames += 1;
    this.handlers.onMalformed?.(detail);
  }
}
