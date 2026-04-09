// Secondary adapter: fetch OpenAPI specs from URL or file path
// Imports only from ports

import type { SchemaFetchPort } from "../../core/ports/index.js";

export class SchemaFetchAdapter implements SchemaFetchPort {
  async fetch(urlOrPath: string, label: string): Promise<string> {
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      return this.fetchFromUrl(urlOrPath, label);
    }
    // Local file — verify it exists and return the path
    const file = Bun.file(urlOrPath);
    if (!(await file.exists())) {
      throw new Error(`Schema file not found: ${urlOrPath}`);
    }
    return urlOrPath;
  }

  async cleanup(path: string): Promise<void> {
    // Only clean up temp files we created
    if (path.startsWith("/tmp/apidiff-")) {
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(path);
      } catch {
        // Temp file already gone — acceptable
      }
    }
  }

  private async fetchFromUrl(url: string, label: string): Promise<string> {
    const response = await fetch(url, {
      headers: { "User-Agent": "apidiff/0.1.0" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${label} schema: HTTP ${response.status} from ${url}`);
    }

    const content = await response.text();
    const ext = content.trimStart().startsWith("{") ? ".json" : ".yaml";
    const tmpPath = `/tmp/apidiff-${label}-${Date.now()}${ext}`;
    await Bun.write(tmpPath, content);
    return tmpPath;
  }
}
