import { execFile } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const renderer = join(packageRoot, "src/md2html/md2html.js");

/**
 * Register exact-output tests for repository-owned Markdown rendering fixtures.
 *
 * @param {Object} [options]
 * @param {string} [options.configPath="spec.config.json"]
 *   Consumer configuration path, relative to root.
 * @param {string} [options.root=process.cwd()]
 *   Consumer repository root.
 */
export function registerMd2htmlFixtureTests({
  configPath = "spec.config.json",
  root = process.cwd(),
} = {}) {
  const consumerRoot = resolve(root);
  const consumerConfigPath = fromRoot(consumerRoot, configPath);
  const specConfig = readJson(consumerConfigPath);
  const testConfig = specConfig.tests?.md2html;

  if (!testConfig?.fixtures) {
    throw new Error(
      `${consumerConfigPath} must configure tests.md2html.fixtures`,
    );
  }

  const fixtureDirectory = fromRoot(consumerRoot, testConfig.fixtures);
  const fixtureConfig = fromRoot(
    consumerRoot,
    testConfig.config ?? join(testConfig.fixtures, "spec.config.json"),
  );
  const otherVersions = testConfig.otherVersions ?? [];

  if (
    !Array.isArray(otherVersions) ||
    !otherVersions.every((value) => typeof value === "string")
  ) {
    throw new Error("tests.md2html.otherVersions must be an array of strings");
  }
  if (!existsSync(fixtureDirectory)) {
    throw new Error(
      `md2html fixture directory does not exist: ${fixtureDirectory}`,
    );
  }
  if (!existsSync(fixtureConfig)) {
    throw new Error(
      `md2html fixture configuration does not exist: ${fixtureConfig}`,
    );
  }

  const fixtures = readdirSync(fixtureDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  if (fixtures.length === 0) {
    throw new Error(`no Markdown fixtures found in ${fixtureDirectory}`);
  }

  describe("md2html fixtures", () => {
    for (const fixture of fixtures) {
      test(fixture, async () => {
        const specification = join(fixtureDirectory, fixture);
        const expectedPath = specification.replace(/\.md$/, ".html");
        const maintainers = specification.replace(/\.md$/, ".maintainers");

        for (const requiredPath of [expectedPath, maintainers]) {
          if (!existsSync(requiredPath)) {
            throw new Error(
              `missing companion file for ${fixture}: ${requiredPath}`,
            );
          }
        }

        const args = [
          "--spec-config",
          fixtureConfig,
          "--maintainers",
          maintainers,
          specification,
        ];
        if (otherVersions.length > 0) args.push(otherVersions.join("\n"));

        const output = await runRenderer(args, consumerRoot);
        if (output.error) {
          throw new Error(output.stderr || output.error.message);
        }

        expect(output.stdout).toBe(readFileSync(expectedPath, "utf8"));
      });
    }
  });
}

function fromRoot(root, path) {
  return isAbsolute(path) ? path : resolve(root, path);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `cannot read md2html test configuration ${path}: ${error.message}`,
    );
  }
}

function runRenderer(args, cwd) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [renderer, ...args],
      { cwd },
      (error, stdout, stderr) => {
        resolve({ error, stdout, stderr });
      },
    );
  });
}
