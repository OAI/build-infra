import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../..");
const testDirs = [];

afterEach(() => {
  while (testDirs.length > 0) {
    rmSync(testDirs.pop(), { recursive: true, force: true });
  }
});

describe("schema publishing", () => {
  test("development branch mode publishes schemas under the configured spec slug and version", () => {
    const repo = createSchemaFixtureRepository();
    git(repo, ["switch", "-c", "v1.1-dev"]);

    const output = runSchemaPublish(repo);
    const date = latestSchemaDate(repo);

    expect(output).toContain("=== Building schemas into ./deploy/fixture/1.1");
    expect(readFileSync(join(repo, "deploy/fixture/1.1/schema", date), "utf8")).toContain('"type": "object"');
  });

  test("src mode can copy a preceding version lander with strict shell variables", () => {
    const repo = createSchemaFixtureRepository();
    mkdirSync(join(repo, "1.0/schema"), { recursive: true });
    writeFileSync(join(repo, "1.0/schema/2026-01-01.md"), "schema lander for 1.0\n");

    runSchemaPublish(repo, ["src"]);

    const files = readdirSync(join(repo, "deploy-preview/schema"));
    const lander = files.find((file) => file.endsWith(".md"));

    expect(lander).toBeTruthy();
    expect(readFileSync(join(repo, "deploy-preview/schema", lander), "utf8")).toContain("deploy-preview");
  });

  test("src mode publishes without a lander when no preceding version exists", () => {
    const repo = createSchemaFixtureRepository();

    const output = runSchemaPublish(repo, ["src"]);
    const date = latestSchemaDate(repo);

    expect(output).toContain(`* schema: ${date} added`);
    expect(readFileSync(join(repo, "deploy-preview/schema", date), "utf8")).toContain('"type": "object"');
  });

  test("src mode renames an existing lander to the schema date", () => {
    const repo = createSchemaFixtureRepository();
    mkdirSync(join(repo, "deploy-preview/schema"), { recursive: true });
    writeFileSync(join(repo, "deploy-preview/schema/old.md"), "existing lander\n");

    runSchemaPublish(repo, ["src"]);

    const date = latestSchemaDate(repo);
    expect(readFileSync(join(repo, "deploy-preview/schema", `${date}.md`), "utf8")).toBe("existing lander\n");
  });

  test("src mode keeps an already current lander in place", () => {
    const repo = createSchemaFixtureRepository();
    const date = latestSchemaDate(repo);
    mkdirSync(join(repo, "deploy-preview/schema"), { recursive: true });
    writeFileSync(join(repo, "deploy-preview/schema", `${date}.md`), "current lander\n");

    const output = runSchemaPublish(repo, ["src"]);

    expect(output).toContain(`* schema did not change since ${date}`);
    expect(readFileSync(join(repo, "deploy-preview/schema", `${date}.md`), "utf8")).toBe("current lander\n");
  });
});

function createSchemaFixtureRepository() {
  const repo = mkdtempSync(join(tmpdir(), "oai-schema-publish-"));
  testDirs.push(repo);

  mkdirSync(join(repo, "src/schemas/validation"), { recursive: true });
  writeFileSync(join(repo, "spec.config.json"), JSON.stringify({
    slug: "fixture",
    schemas: ["schema.yaml"]
  }));
  writeFileSync(join(repo, "src/schemas/validation/schema.yaml"), "type: object\n");

  git(repo, ["init"]);
  git(repo, ["config", "user.name", "Fixture Maintainer"]);
  git(repo, ["config", "user.email", "fixture@example.com"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "fixture"]);

  return repo;
}

function latestSchemaDate(repo) {
  return git(repo, ["log", "-1", "--format=%cd", "--date=short", "src/schemas/validation/schema.yaml"]);
}

function runSchemaPublish(repo, args = []) {
  return execFileSync("bash", [join(packageRoot, "src/schema/schema-publish.sh"), ...args], {
    cwd: repo,
    encoding: "utf8"
  });
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trimEnd();
}
