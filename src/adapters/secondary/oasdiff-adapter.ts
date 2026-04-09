// Secondary adapter: oasdiff binary interaction
// Imports only from ports

import type { OasdiffPort } from "../../core/ports/index.js";
import type { SchemaCompareMode, SchemaCompareResult } from "../../core/domain/types.js";

export class OasdiffAdapter implements OasdiffPort {
  private binaryPath: string | null = null;

  async ensureInstalled(): Promise<string> {
    if (this.binaryPath) return this.binaryPath;

    // Check if oasdiff is already in PATH
    const which = Bun.spawnSync(["which", "oasdiff"]);
    if (which.exitCode === 0) {
      this.binaryPath = which.stdout.toString().trim();
      return this.binaryPath;
    }

    // Check common install locations
    const locations = ["/usr/local/bin/oasdiff", "/opt/homebrew/bin/oasdiff"];
    for (const loc of locations) {
      if (await Bun.file(loc).exists()) {
        this.binaryPath = loc;
        return this.binaryPath;
      }
    }

    throw new Error(
      "oasdiff binary not found. Install via:\n" +
        "  macOS:  brew install oasdiff\n" +
        "  Linux:  curl -fsSL https://github.com/oasdiff/oasdiff/releases/latest/download/oasdiff_linux_amd64.tar.gz | tar -xz -C /usr/local/bin",
    );
  }

  async compare(
    basePath: string,
    revisionPath: string,
    mode: SchemaCompareMode,
  ): Promise<SchemaCompareResult> {
    const binary = await this.ensureInstalled();

    const args = [binary, mode, basePath, revisionPath, "--format", "text"];
    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode > 1) {
      throw new Error(`oasdiff failed (exit ${exitCode}): ${stderr}`);
    }

    return {
      output: output || stderr,
      exitCode,
      mode,
      breakingCount: countMatches(output, /\[breaking\]/gi),
      deprecatedCount: countMatches(output, /\[deprecated\]/gi),
      nonBreakingCount: countMatches(output, /\[added\]/gi),
    };
  }
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}
