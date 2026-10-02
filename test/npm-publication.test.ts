import assert from "node:assert/strict";
import test from "node:test";
import { claimsPublishedNpmPackage, officialNpmRegistryHostname } from "../dist/npm-publication.js";

test("only the parsed npm registry host counts as a publication URL", () => {
  assert.equal(officialNpmRegistryHostname("https://registry.npmjs.org/iaf-agent-bridge"), "registry.npmjs.org");
  assert.equal(officialNpmRegistryHostname("https://user:token@registry.npmjs.org:443/iaf-agent-bridge"), "registry.npmjs.org");
  assert.equal(officialNpmRegistryHostname("http://REGISTRY.NPMJS.ORG/iaf-agent-bridge"), "registry.npmjs.org");
  assert.equal(officialNpmRegistryHostname("https://evil.example/registry.npmjs.org"), undefined);
  assert.equal(officialNpmRegistryHostname("https://evil.example/?next=https://registry.npmjs.org"), undefined);
  assert.equal(officialNpmRegistryHostname("https://registry.npmjs.org.evil.example/pkg"), undefined);
  assert.equal(officialNpmRegistryHostname("https://notregistry.npmjs.org/pkg"), undefined);
  assert.equal(officialNpmRegistryHostname("registry.npmjs.org"), undefined);
});

test("an npm package claim is structural, not a substring of the document", () => {
  assert.equal(claimsPublishedNpmPackage({
    description: "See https://evil.example/registry.npmjs.org for a lookalike",
    websiteUrl: "https://github.com/francescoveryra-dot/IAF-Agent-Bridge",
  }), false);
  assert.equal(claimsPublishedNpmPackage({
    packages: [{ registryType: "npm", identifier: "iaf-agent-bridge" }],
  }), true);
  assert.equal(claimsPublishedNpmPackage({
    websiteUrl: "https://registry.npmjs.org/iaf-agent-bridge",
  }), true);
});
