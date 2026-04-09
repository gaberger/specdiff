#!/usr/bin/env bun
// CLI entry point

import { createCliApp } from "./composition-root.js";

const { responseDiffService, schemaDiffService, presenter } = createCliApp();

const args = process.argv.slice(2);
const command = args[0];

// Provider spec URL registry
const PROVIDER_SPECS: Record<string, (v: string) => string> = {
  stripe: (v) => `https://raw.githubusercontent.com/stripe/openapi/${v}/openapi/spec3.json`,
  github: (v) => `https://raw.githubusercontent.com/github/rest-api-description/${v}/descriptions/api.github.com/api.github.com.json`,
  twilio: (v) => `https://raw.githubusercontent.com/twilio/twilio-oai/${v}/spec/json/twilio_api_v2010.json`,
  forward: (v) => {
    const parts = v.split(".").map(Number);
    const isNew = parts[0]! > 26 || (parts[0] === 26 && (parts[1] ?? 0) >= 2);
    return isNew
      ? `https://docs.fwd.app/${v}/api/spec/complete.json`
      : `https://docs.fwd.app/${v}/api-doc/api/spec/complete.json`;
  },
};

async function fetchSpec(urlOrPath: string): Promise<unknown> {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    const res = await fetch(urlOrPath, { headers: { "User-Agent": "apidiff" } });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText} from ${urlOrPath}`);
    return res.json();
  }
  return Bun.file(urlOrPath).json();
}

if (command === "diff") {
  const provider = getFlag(args, "--provider");

  if (provider) {
    // Provider mode: apidiff diff --provider forward 26.2 26.3
    const specFn = PROVIDER_SPECS[provider];
    if (!specFn) {
      presenter.presentError(`Unknown provider: ${provider}. Available: ${Object.keys(PROVIDER_SPECS).join(", ")}`);
      process.exit(1);
    }
    const providerArgs = args.filter((a) => a !== "--provider" && a !== provider && a !== "diff");
    const [oldVer, newVer] = providerArgs;
    if (!oldVer || !newVer) {
      presenter.presentError(`Usage: apidiff diff --provider ${provider} <old_version> <new_version>`);
      process.exit(1);
    }
    console.log(`  Fetching ${provider} spec ${oldVer}...`);
    const v1 = await fetchSpec(specFn(oldVer));
    console.log(`  Fetching ${provider} spec ${newVer}...`);
    const v2 = await fetchSpec(specFn(newVer));
    const results = responseDiffService.diff(v1, v2);
    presenter.presentDiffResults(results);
  } else {
    // File mode: apidiff diff <v1.json> <v2.json>
    const [, v1Path, v2Path] = args;
    if (!v1Path || !v2Path) {
      presenter.presentError("Usage: apidiff diff <v1.json> <v2.json>\n       apidiff diff --provider <name> <old_ver> <new_ver>");
      process.exit(1);
    }
    const v1 = await fetchSpec(v1Path);
    const v2 = await fetchSpec(v2Path);
    const results = responseDiffService.diff(v1, v2);
    presenter.presentDiffResults(results);
  }

} else if (command === "guide") {
  // Guide: apidiff guide <v1.json> <v2.json> [--base v1] [--revision v2] [--sunset 2025-01-01]
  const [, v1Path, v2Path] = args;
  if (!v1Path || !v2Path) {
    presenter.presentError("Usage: apidiff guide <v1.json> <v2.json> [--base v1] [--revision v2]");
    process.exit(1);
  }

  const baseVersion = getFlag(args, "--base") ?? "v1";
  const revisionVersion = getFlag(args, "--revision") ?? "v2";
  const sunsetDate = getFlag(args, "--sunset");

  const v1 = await Bun.file(v1Path).json();
  const v2 = await Bun.file(v2Path).json();
  const guide = responseDiffService.generateGuide(v1, v2, baseVersion, revisionVersion, sunsetDate);
  presenter.presentGuide(guide);

} else if (command === "schema") {
  // Schema diff: apidiff schema <base_url> <revision_url> [--mode changelog]
  const [, baseUrl, revisionUrl] = args;
  if (!baseUrl || !revisionUrl) {
    presenter.presentError("Usage: apidiff schema <base_url> <revision_url> [--mode changelog|breaking|summary]");
    process.exit(1);
  }

  const mode = (getFlag(args, "--mode") ?? "changelog") as "changelog" | "breaking" | "summary";
  const failOnBreaking = args.includes("--fail-on-breaking");

  const result = await schemaDiffService.compare(baseUrl, revisionUrl, mode);
  presenter.presentSchemaResult(result);

  if (failOnBreaking && schemaDiffService.hasBreakingChanges(result)) {
    process.exit(1);
  }

} else {
  console.log(`
  apidiff — API migration toolkit

  Commands:
    diff   <v1.json> <v2.json>                         Compare two JSON/spec files
    diff   --provider <name> <old_ver> <new_ver>       Fetch & compare provider specs
    guide  <v1.json> <v2.json> [--base v1] [--rev v2]  Generate migration guide
    schema <base_url> <revision_url> [--mode changelog] Compare OpenAPI schemas

  Providers:
    stripe   — Stripe OpenAPI specs (versions: v2228, v2229, ...)
    github   — GitHub REST API specs (versions: v2.0.0, v2.1.0, ...)
    twilio   — Twilio OAI specs (versions: 2.6.5, 2.6.6, ...)
    forward  — Forward Networks specs (versions: 25.9, 26.2, 26.3, ...)

  Options:
    --provider <name>                    Fetch specs from provider (stripe|github|twilio|forward)
    --mode changelog|breaking|summary    Schema diff mode (default: changelog)
    --fail-on-breaking                   Exit 1 if breaking changes found (CI)
    --base <version>                     Base version label
    --revision <version>                 Revision version label
    --sunset <date>                      Sunset date for migration guide

  Examples:
    apidiff diff old.json new.json
    apidiff diff --provider forward 26.2 26.3
    apidiff diff --provider stripe v2228 v2229
    apidiff guide old.json new.json --base v1 --revision v2 --sunset 2025-06-30
  `);
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}
