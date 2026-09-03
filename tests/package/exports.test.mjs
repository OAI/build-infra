import { describe, expect, test } from "vitest";

describe("package exports", () => {
  test("public helper modules can be imported by consumer repositories", async () => {
    const testHelpers = await import("@oai/build-infra/test");
    const testConfig = await import("@oai/build-infra/schema/test-config");
    const schemaVitest = await import("@oai/build-infra/schema/vitest");
    const openApi30 = await import("@oai/build-infra/schema/openapi-3-0-test");
    const vitestConfig = await import("@oai/build-infra/vitest-config");

    expect(testHelpers.test).toBeTypeOf("function");
    expect(testHelpers.expect).toBeTypeOf("function");
    expect(testConfig.createTestConfig).toBeTypeOf("function");
    expect(schemaVitest.registerSchema).toBeTypeOf("function");
    expect(schemaVitest.toMatchJsonSchema).toBeTypeOf("function");
    expect(openApi30.validate).toBeTypeOf("function");
    expect(openApi30.contentTypeParser.parse).toBeTypeOf("function");
    expect(openApi30.contentTypeParser.parse("application/schema+yaml; schema=https://example.com/schema"))
      .toMatchObject({
        type: "application/schema+yaml",
        parameters: { schema: "https://example.com/schema" }
      });
    expect(openApi30.YAML).toBeTypeOf("object");
    expect(vitestConfig.createVitestConfig).toBeTypeOf("function");
    expect(vitestConfig.default).toBeTypeOf("object");
  });
});
