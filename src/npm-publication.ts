const NPM_REGISTRY_HOST = "registry.npmjs.org";

export function officialNpmRegistryHostname(value: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  return parsed.hostname === NPM_REGISTRY_HOST ? parsed.hostname : undefined;
}

export function collectOfficialNpmRegistryUrls(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    if (officialNpmRegistryHostname(value)) found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectOfficialNpmRegistryUrls(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectOfficialNpmRegistryUrls(item, found);
    }
  }
  return found;
}

export function claimsPublishedNpmPackage(document: unknown): boolean {
  if (!document || typeof document !== "object") return false;
  const packages = (document as { packages?: unknown }).packages;
  if (Array.isArray(packages)) {
    for (const entry of packages) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as { registryType?: unknown; registryBaseUrl?: unknown };
      if (record.registryType === "npm") return true;
      if (typeof record.registryBaseUrl === "string" && officialNpmRegistryHostname(record.registryBaseUrl)) return true;
    }
  }
  return collectOfficialNpmRegistryUrls(document).length > 0;
}
