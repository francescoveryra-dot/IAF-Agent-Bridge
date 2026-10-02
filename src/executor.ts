import { runDoctor, type DoctorOptions } from "./doctor.js";
import { BridgeError } from "./errors.js";
import { runTurn, type TurnHooks, type TurnInput } from "./turn.js";
import type { DelegationResult } from "./types.js";

export interface CodingExecutor {
  readonly id: "cursor";
  readonly productionReady: true;
  run(input: TurnInput, hooks?: TurnHooks): Promise<DelegationResult>;
  diagnose(options?: DoctorOptions): Promise<Record<string, unknown>>;
}

export class CursorExecutor implements CodingExecutor {
  readonly id = "cursor" as const;
  readonly productionReady = true as const;

  run(input: TurnInput, hooks?: TurnHooks): Promise<DelegationResult> {
    return runTurn(input, hooks);
  }

  diagnose(options?: DoctorOptions): Promise<Record<string, unknown>> {
    return runDoctor(options);
  }
}

const registry = new Map<string, CodingExecutor>([["cursor", new CursorExecutor()]]);

export function resolveExecutor(id: string): CodingExecutor {
  const found = registry.get(id);
  if (!found?.productionReady) {
    throw new BridgeError(
      "executor-unavailable",
      `No production executor is registered for "${id}". V1 provides the Cursor executor only.`,
    );
  }
  return found;
}
