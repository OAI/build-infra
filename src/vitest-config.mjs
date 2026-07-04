import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const consumerRequire = createRequire(`${process.cwd()}/package.json`);

export async function createVitestConfig({
  globalSetup = ["tests/schema/setup.mjs"],
  coverageInclude = ["src/schemas/validation/**/*.yaml"],
  thresholds = process.env.BASE !== "dev" ? {
    statements: 100,
    lines: 100,
    functions: 100
  } : {}
} = {}) {
  const { jsonSchemaCoveragePlugin } = await import(consumerRequire.resolve("@hyperjump/json-schema-coverage/vitest"));

  return defineConfig({
    root: process.cwd(),
    plugins: [jsonSchemaCoveragePlugin()],
    test: {
      globalSetup,
      coverage: {
        include: coverageInclude,
        thresholds
      },
      forceRerunTriggers: ["**/src/**", "**/tests/**"],
      testTimeout: 20000
    }
  });
}

export default await createVitestConfig();
