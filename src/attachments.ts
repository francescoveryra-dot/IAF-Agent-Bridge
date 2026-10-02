import { realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface PromptBlock {
  type: string;
  text?: string;
  mimeType?: string;
  data?: string;
  uri?: string;
  name?: string;
}

export async function buildPromptBlocks(input: {
  prompt: string;
  workspace: string;
  contextFiles?: string[];
  imagesAccepted: boolean;
  warnings: string[];
}): Promise<PromptBlock[]> {
  const blocks: PromptBlock[] = [{ type: "text", text: input.prompt }];
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const entry of input.contextFiles ?? []) {
    if (!entry.trim()) continue;
    const abs = path.resolve(input.workspace, entry);
    let canonical: string;
    try {
      canonical = realpathSync(abs);
    } catch {
      if (!seen.has(abs)) {
        seen.add(abs);
        missing.push(entry);
      }
      continue;
    }
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    let info;
    try {
      info = statSync(canonical);
    } catch {
      missing.push(entry);
      continue;
    }
    if (!info.isFile()) {
      input.warnings.push(`contextFile ${entry} skipped: not a file`);
      continue;
    }
    const mimeType = IMAGE_MIME[path.extname(canonical).toLowerCase()];
    if (mimeType) {
      if (!input.imagesAccepted) {
        input.warnings.push(`contextFile ${entry} skipped: this Cursor agent does not accept image prompts`);
        continue;
      }
      if (info.size > MAX_IMAGE_BYTES) {
        input.warnings.push(`contextFile ${entry} skipped: image exceeds 5MB`);
        continue;
      }
      const data = (await readFile(canonical)).toString("base64");
      blocks.push({ type: "image", mimeType, data });
      continue;
    }
    blocks.push({
      type: "resource_link",
      uri: pathToFileURL(canonical).href,
      name: path.basename(canonical),
    });
  }
  if (missing.length) {
    input.warnings.push(`contextFile skipped: not found: ${missing.join(", ")}`);
  }
  return blocks;
}
