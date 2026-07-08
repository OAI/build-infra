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
  test("src mode can copy a preceding version lander with strict shell variables", () => {
    const repo = mkdtempSync(join(tmpdir(), "oai-schema-publish-"));
    testDirs.push(repo);

    mkdirSync(join(repo, "src/schemas/validation"), { recursive: true });
    mkdirSync(join(repo, "1.0/schema"), { recursive: true });
    writeFileSync(join(repo, "spec.config.json"), JSON.stringify({
      slug: "fixture",
      schemas: ["schema.yaml"]
    }));
    writeFileSync(join(repo, "src/schemas/validation/schema.yaml"), "type: object\n");
    writeFileSync(join(repo, "1.0/schema/2026-01-01.md"), "schema lander for 1.0\n");

    git(repo, ["init"]);
    git(repo, ["config", "user.name", "Fixture Maintainer"]);
    git(repo, ["config", "user.email", "fixture@example.com"]);
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "fixture"]);

    execFileSync("bash", [join(packageRoot, "src/schema/schema-publish.sh"), "src"], {
      cwd: repo,
      encoding: "utf8"
    });

    const files = readdirSync(join(repo, "deploy-preview/schema"));
    const lander = files.find((file) => file.endsWith(".md"));

    expect(lander).toBeTruthy();
    expect(readFileSync(join(repo, "deploy-preview/schema", lander), "utf8")).toContain("deploy-preview");
  });
});

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trimEnd();
}
