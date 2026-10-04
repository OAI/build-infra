import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Hyperjump keeps schema registrations and media-type plugins in module state.
// Resolve every API beside the coverage plugin so nested installs share it.
const coverageEntry = import.meta.resolve("@hyperjump/json-schema-coverage/vitest");
const coverageRequire = createRequire(coverageEntry);

async function importCoverageDependency(specifier) {
  const path = coverageRequire.resolve(specifier);
  return import(pathToFileURL(path).href);
}

const modules = await Promise.all([
  importCoverageDependency("@hyperjump/browser"),
  importCoverageDependency("@hyperjump/json-schema/draft-2020-12"),
  importCoverageDependency("@hyperjump/json-schema/experimental"),
  importCoverageDependency("@hyperjump/json-schema/openapi-3-0"),
  importCoverageDependency("@hyperjump/json-schema/openapi-3-1")
]);

export const browser = modules[0];
export const draft202012 = modules[1];
export const experimental = modules[2];
export const openApi30 = modules[3];
export const openApi31 = modules[4];
