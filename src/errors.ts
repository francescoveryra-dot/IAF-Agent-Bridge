export class BridgeError extends Error {
  readonly reason: string;
  readonly sessionId?: string;
  readonly partialResult?: string;
  readonly rpcCode?: number;

  constructor(
    reason: string,
    message: string,
    extra?: { sessionId?: string; partialResult?: string; rpcCode?: number },
  ) {
    super(message);
    this.name = "BridgeError";
    this.reason = reason;
    this.sessionId = extra?.sessionId;
    this.partialResult = extra?.partialResult;
    this.rpcCode = extra?.rpcCode;
  }
}

export function isBridgeError(err: unknown): err is BridgeError {
  return err instanceof BridgeError;
}

export function formatTurnError(err: unknown): string {
  if (err instanceof BridgeError) {
    const parts = [`delegate failed [${err.reason}]: ${err.message}`];
    if (err.sessionId) parts.push(`sessionId=${err.sessionId}`);
    if (err.partialResult) parts.push(`partialResult=${err.partialResult.slice(0, 8_000)}`);
    return parts.join(" ");
  }
  const message = err instanceof Error ? err.message : String(err);
  return `delegate failed [unknown]: ${message}`;
}
