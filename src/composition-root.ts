// Composition root — the ONLY file that imports across boundaries
// Wires adapters to ports and creates use case instances

import { ResponseDiffService } from "./core/usecases/response-diff-service.js";
import { SchemaDiffService } from "./core/usecases/schema-diff-service.js";
import { MemoryChecklistStorage } from "./adapters/secondary/memory-storage.js";
import { SchemaFetchAdapter } from "./adapters/secondary/schema-fetch-adapter.js";
import { OasdiffAdapter } from "./adapters/secondary/oasdiff-adapter.js";
import { CliAdapter } from "./adapters/primary/cli-adapter.js";
import { WebAdapter } from "./adapters/primary/web-adapter.js";
import { SpecInputAdapter } from "./adapters/secondary/spec-input-adapter.js";

export function createCliApp() {
  const storage = new MemoryChecklistStorage();
  const schemaFetch = new SchemaFetchAdapter();
  const oasdiff = new OasdiffAdapter();

  const responseDiffService = new ResponseDiffService(storage);
  const schemaDiffService = new SchemaDiffService(schemaFetch, oasdiff);
  const presenter = new CliAdapter();

  return { responseDiffService, schemaDiffService, presenter };
}

export function createWebApp() {
  const storage = new MemoryChecklistStorage();
  const responseDiffService = new ResponseDiffService(storage);
  const specInput = new SpecInputAdapter();

  const webAdapter = new WebAdapter(
    (oldJson, newJson) => responseDiffService.diff(oldJson, newJson),
    (oldJson, newJson, baseVersion, revisionVersion, sunsetDate) =>
      responseDiffService.generateGuide(oldJson, newJson, baseVersion, revisionVersion, sunsetDate),
    specInput,
  );

  return { responseDiffService, webAdapter, specInput };
}
