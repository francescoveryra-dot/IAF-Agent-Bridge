const THOUGHT_IDS = new Set(["thinking", "reasoning", "effort", "thought_level"]);

export interface ConfigOption {
  id?: string;
  name?: string;
  options?: Array<{ value?: string }>;
}

export function asConfigOptions(value: unknown): ConfigOption[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as ConfigOption[] : [];
}

function valuesOf(option: ConfigOption): string[] {
  return (option.options ?? []).map((entry) => entry?.value).filter((value): value is string => typeof value === "string");
}

export function resolveEffort(options: ConfigOption[], value: string):
  | { ok: true; id: string; value: string }
  | { ok: false; reason: "unavailable" | "unsupported" | "invalid"; accepted: string[] } {
  if (options.length === 0) return { ok: false, reason: "unavailable", accepted: [] };
  const thought = options.filter((option) => {
    const id = option.id?.toLowerCase() ?? "";
    const name = option.name?.toLowerCase() ?? "";
    return THOUGHT_IDS.has(id) || /thinking|reasoning|thought/.test(name);
  });
  if (thought.length === 0) return { ok: false, reason: "unsupported", accepted: [] };
  const accepted = [...new Set(thought.flatMap(valuesOf))];
  const match = thought.find((option) => typeof option.id === "string" && valuesOf(option).includes(value));
  if (!match?.id) return { ok: false, reason: "invalid", accepted };
  return { ok: true, id: match.id, value };
}
