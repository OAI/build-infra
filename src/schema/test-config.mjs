import { readFile } from "node:fs/promises";
import { addMediaTypePlugin } from "@hyperjump/browser";
import { registerSchema } from "@hyperjump/json-schema/draft-2020-12";
import { buildSchemaDocument, defineVocabulary } from "@hyperjump/json-schema/experimental";
import YAML from "yaml";

const parseYamlFromFile = async (filePath) => {
  const text = await readFile(filePath, "utf8");
  return YAML.parse(text, { prettyErrors: true });
};

/**
 * Factory for the vitest globalSetup function used by OAI specification repos.
 *
 * @param {Object} options
 * @param {Array<{keyword: string, uri: string}>} options.vocabularyKeywords
 *   OAS-specific vocabulary keywords to register. Omit or pass [] for specs
 *   that use standard JSON Schema without a custom vocabulary.
 *
 * @returns {() => Promise<void>} vitest globalSetup function
 *
 * Usage in a consumer repo's tests/schema/setup.mjs:
 *
 *   // Standard JSON Schema (no custom vocabulary):
 *   import { createTestConfig } from "@oai/build-infra/schema/test-config";
 *   export default createTestConfig();
 *
 *   // With OAS vocabulary keywords:
 *   import { createTestConfig } from "@oai/build-infra/schema/test-config";
 *   export default createTestConfig({
 *     vocabularyKeywords: [
 *       { keyword: "discriminator", uri: "https://spec.openapis.org/oas/3.0/keyword/discriminator" },
 *       { keyword: "example",       uri: "https://spec.openapis.org/oas/3.0/keyword/example" },
 *       { keyword: "externalDocs",  uri: "https://spec.openapis.org/oas/3.0/keyword/externalDocs" },
 *       { keyword: "xml",           uri: "https://spec.openapis.org/oas/3.0/keyword/xml" },
 *     ],
 *   });
 */
export function createTestConfig({ vocabularyKeywords = [] } = {}) {
  return async () => {
    try {
      addMediaTypePlugin("application/schema+yaml", {
        parse: async (response) => {
          return buildSchemaDocument(YAML.parse(await response.text()), response.url);
        },
        fileMatcher: (path) => path.endsWith(".yaml")
      });

      if (vocabularyKeywords.length > 0) {
        const dialect = await parseYamlFromFile("./src/schemas/validation/dialect.yaml");
        const meta = await parseYamlFromFile("./src/schemas/validation/meta.yaml");
        const vocabUri = Object.keys(meta.$vocabulary)[0];

        defineVocabulary(
          vocabUri,
          Object.fromEntries(vocabularyKeywords.map(({ keyword, uri }) => [keyword, uri]))
        );

        registerSchema(meta);
        registerSchema(dialect);
      }
    } catch (error) {
      // silently ignore missing files in repos that don't use this path
    }
  };
}
