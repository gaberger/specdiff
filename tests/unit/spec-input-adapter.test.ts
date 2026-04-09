import { describe, expect, test } from "bun:test";
import { SpecInputAdapter } from "../../src/adapters/secondary/spec-input-adapter.js";

const adapter = new SpecInputAdapter();

const OPENAPI_30_JSON = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Petstore", version: "1.0.0" },
  paths: {
    "/pets": {
      get: { summary: "List pets", responses: { "200": { description: "OK" } } },
    },
  },
});

const OPENAPI_30_YAML = `
openapi: "3.0.3"
info:
  title: Petstore
  version: "1.0.0"
paths:
  /pets:
    get:
      summary: List pets
      responses:
        "200":
          description: OK
`;

const SWAGGER_20_JSON = JSON.stringify({
  swagger: "2.0",
  info: { title: "Legacy API", version: "0.9" },
  paths: {},
});

describe("SpecInputAdapter.fromFile", () => {
  test("parses OpenAPI 3.0 JSON file", async () => {
    const spec = await adapter.fromFile(OPENAPI_30_JSON, "api.json");
    expect(spec.format).toBe("openapi-3.0");
    expect(spec.metadata.title).toBe("Petstore");
    expect(spec.metadata.version).toBe("1.0.0");
    expect(spec.document).toBeDefined();
  });

  test("parses OpenAPI 3.0 YAML file", async () => {
    const spec = await adapter.fromFile(OPENAPI_30_YAML, "api.yaml");
    expect(spec.format).toBe("openapi-3.0");
    expect(spec.metadata.title).toBe("Petstore");
    expect(spec.metadata.version).toBe("1.0.0");
  });

  test("parses Swagger 2.0 JSON file", async () => {
    const spec = await adapter.fromFile(SWAGGER_20_JSON, "legacy.json");
    expect(spec.format).toBe("openapi-2.0");
    expect(spec.metadata.title).toBe("Legacy API");
    expect(spec.metadata.version).toBe("0.9");
  });

  test("detects YAML from .yml extension", async () => {
    const spec = await adapter.fromFile(OPENAPI_30_YAML, "api.yml");
    expect(spec.format).toBe("openapi-3.0");
  });

  test("rejects empty file", async () => {
    await expect(adapter.fromFile("", "empty.json")).rejects.toThrow("Empty file");
  });

  test("rejects whitespace-only file", async () => {
    await expect(adapter.fromFile("   \n  ", "blank.json")).rejects.toThrow("Empty file");
  });

  test("rejects malformed JSON", async () => {
    await expect(adapter.fromFile("{bad json", "broken.json")).rejects.toThrow("Failed to parse");
  });

  test("rejects malformed YAML", async () => {
    await expect(adapter.fromFile(":\n  - :\n    {[", "broken.yaml")).rejects.toThrow("Failed to parse");
  });

  test("rejects non-OpenAPI JSON object", async () => {
    await expect(adapter.fromFile('{"name":"not an api"}', "random.json")).rejects.toThrow("Unsupported format");
  });

  test("rejects JSON array", async () => {
    await expect(adapter.fromFile("[1,2,3]", "array.json")).rejects.toThrow("Unsupported format");
  });

  test("rejects JSON primitive", async () => {
    await expect(adapter.fromFile('"hello"', "string.json")).rejects.toThrow("Unsupported format");
  });

  test("JSON and YAML produce equivalent output", async () => {
    const fromJson = await adapter.fromFile(OPENAPI_30_JSON, "api.json");
    const fromYaml = await adapter.fromFile(OPENAPI_30_YAML, "api.yaml");
    expect(fromJson.format).toBe(fromYaml.format);
    expect(fromJson.metadata).toEqual(fromYaml.metadata);
  });
});

describe("SpecInputAdapter.fromUrl", () => {
  test("rejects invalid URL", async () => {
    await expect(adapter.fromUrl("http://localhost:1/nonexistent")).rejects.toThrow("Failed to fetch");
  });
});

describe("integration: resolved spec flows through diff", () => {
  test("two specs produce valid diff results", async () => {
    const { computeDiff } = await import("../../src/core/domain/diff-algorithm.js");
    const { flatten } = await import("../../src/core/domain/flatten.js");

    const specV1 = await adapter.fromFile(JSON.stringify({
      openapi: "3.0.0",
      info: { title: "API", version: "1.0" },
      paths: { "/users": { get: { summary: "List users" } } },
    }), "v1.json");

    const specV2 = await adapter.fromFile(JSON.stringify({
      openapi: "3.0.0",
      info: { title: "API", version: "2.0" },
      paths: { "/users": { get: { summary: "List all users" } } },
    }), "v2.json");

    const results = computeDiff(specV1.document, specV2.document);
    const changed = results.filter(r => r.type === "changed");
    expect(changed.length).toBeGreaterThan(0);

    // version and summary both changed
    const paths = changed.map(r => r.path);
    expect(paths).toContain("info.version");
    expect(paths).toContain("paths./users.get.summary");
  });
});
