#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { BASIC } from "@hyperjump/json-schema/experimental";

import contentTypeParser from "content-type";
import { addMediaTypePlugin } from "@hyperjump/browser";
import { buildSchemaDocument } from "@hyperjump/json-schema/experimental";

addMediaTypePlugin("application/schema+yaml", {
    parse: async (response) => {
      const contentType = contentTypeParser.parse(response.headers.get("content-type") ?? "");
      const contextDialectId = contentType.parameters.schema ?? contentType.parameters.profile;
  
      const doc = YAML.parse(await response.text());
      return buildSchemaDocument(doc, response.url, contextDialectId);
    },
    fileMatcher: (path) => path.endsWith(".yaml")
  });

const defaultOutputFormat = BASIC;

if (process.argv.length < 3) {
  console.log(`Usage: validate [--schema=schema] [--format=${defaultOutputFormat}] [--dialect=draft-2020-12] path-to-file.yaml`);
  console.log("\t--schema:  (schema (default) | schema-base) The name of the schema file to use");
  console.log(`\t--format:  (Default: ${defaultOutputFormat}) The JSON Schema output format to use. Options: FLAG, BASIC, DETAILED, VERBOSE`);
  console.log("\t--dialect: JSON Schema dialect to use (default: draft-2020-12; use openapi-3-1 for OAS schemas)");
  process.exit(1);
}

const args = process.argv.reduce((acc, arg) => {
  if (!arg.startsWith("--")) return acc;

  const [argName, argValue] = arg.substring(2).split("=", 2);
  return { ...acc, [argName]: argValue };
}, {});

const schemaType = args.schema || "schema";
const outputFormat = args.format || defaultOutputFormat;
const dialect = args.dialect || "draft-2020-12";

// Import the appropriate validator based on dialect
let validate, setMetaSchemaOutputFormat;
if (dialect === "openapi-3-1") {
  ({ validate, setMetaSchemaOutputFormat } = await import("@hyperjump/json-schema/openapi-3-1"));
} else {
  ({ validate, setMetaSchemaOutputFormat } = await import("@hyperjump/json-schema/draft-2020-12"));
}

// Config
setMetaSchemaOutputFormat(outputFormat);

// Compile / meta-validate
const validateSchema = await validate(`./src/schemas/validation/${schemaType}.yaml`);

// Validate instance
const instanceYaml = await readFile(`${process.argv[process.argv.length - 1]}`, "utf8");
const instance = YAML.parse(instanceYaml);
const results = validateSchema(instance, outputFormat);
console.log(JSON.stringify(results, null, "  "));
