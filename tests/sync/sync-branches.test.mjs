import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { parseSyncArgs } from "../../src/sync/sync-branches.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../..");
const syncBin = join(packageRoot, "bin/oai-spec-sync-branches");
const testDirs = [];

afterEach(() => {
  while (testDirs.length > 0) {
    rmSync(testDirs.pop(), { recursive: true, force: true });
  }
});

describe("branch synchronization", () => {
  test("merges main into dev while preserving release-removed paths", () => {
    const repo = createFixtureRepository();

    runNode(repo, [
      syncBin,
      "--head=main",
      "--base=dev",
      "--no-push",
      "--no-pr"
    ]);

    expect(runGit(repo, ["branch", "--show-current"])).toBe("dev-sync-with-main");
    expect(read(repo, "src/spec.md")).toBe("development source\n");
    expect(read(repo, "tests/schema/pass/example.yaml")).toBe("development fixture\n");
    expect(read(repo, "tests/schema/schema.test.mjs")).toBe("development runner\n");
    expect(read(repo, "tests/schema/shared.mjs")).toBe("shared from main\n");
    expect(() => read(repo, "branch-only.txt")).toThrow();
    expect(runGit(repo, ["show", "-s", "--format=%s", "HEAD"])).toBe(
      "Restore destination-owned paths"
    );
    expect(runGit(repo, ["rev-list", "--parents", "-n", "1", "HEAD^"]).split(" ")).toHaveLength(3);
  });

  test("matches multi-digit version branches and preserves each version's content", () => {
    const repo = createFixtureRepository();
    runGit(repo, ["switch", "dev"]);
    writeFileSync(join(repo, "tests/schema/shared.mjs"), "shared from dev\n");
    runGit(repo, ["add", "."]);
    runGit(repo, ["commit", "-m", "update shared development test support"]);
    runGit(repo, ["push", "origin", "dev"]);

    runNode(repo, [
      syncBin,
      "--head=dev",
      "--base-pattern=^v[0-9]+\\.[0-9]+-dev$",
      "--no-push",
      "--no-pr"
    ]);

    expect(runGit(repo, ["branch", "--show-current"])).toBe("v12.34-dev-sync-with-dev");
    expect(read(repo, "src/spec.md")).toBe("version source\n");
    expect(read(repo, "tests/schema/pass/example.yaml")).toBe("version fixture\n");
    expect(read(repo, "tests/schema/shared.mjs")).toBe("shared from dev\n");
  });

  test("requires one destination selector", () => {
    expect(() => parseSyncArgs(["--head=main"])).toThrow(
      /exactly one of --base or --base-pattern/
    );
    expect(() => parseSyncArgs(["--head=main", "--base=dev", "--base-pattern=.*"])).toThrow(
      /exactly one of --base or --base-pattern/
    );
  });

  test("leaves unrelated merge conflicts for human review", () => {
    const repo = createFixtureRepository();
    runGit(repo, ["switch", "main"]);
    writeFileSync(join(repo, "tests/schema/shared.mjs"), "conflicting main change\n");
    runGit(repo, ["add", "."]);
    runGit(repo, ["commit", "-m", "change shared support on main"]);
    runGit(repo, ["push", "origin", "main"]);

    runGit(repo, ["switch", "dev"]);
    writeFileSync(join(repo, "tests/schema/shared.mjs"), "conflicting dev change\n");
    runGit(repo, ["add", "."]);
    runGit(repo, ["commit", "-m", "change shared support on dev"]);
    runGit(repo, ["push", "origin", "dev"]);

    expect(() => runNode(repo, [
      syncBin,
      "--head=main",
      "--base=dev",
      "--no-push",
      "--no-pr"
    ])).toThrow(/conflicts outside destination-owned paths/);
    expect(runGit(repo, ["diff", "--name-only", "--diff-filter=U"]))
      .toContain("tests/schema/shared.mjs");
  });
});

function createFixtureRepository() {
  const root = mkdtempSync(join(tmpdir(), "oai-branch-sync-test-"));
  testDirs.push(root);
  const remote = join(root, "remote.git");
  const repo = join(root, "consumer");

  runGit(root, ["init", "--bare", remote]);
  runGit(root, ["init", repo]);
  runGit(repo, ["branch", "-M", "main"]);
  runGit(repo, ["config", "user.name", "Fixture Maintainer"]);
  runGit(repo, ["config", "user.email", "fixture@example.com"]);
  runGit(repo, ["remote", "add", "origin", remote]);

  write(repo, "spec.config.json", `${JSON.stringify({
    release: {
      removeOnReleaseBranch: [
        "src",
        "tests/schema/pass",
        "tests/schema/fail",
        "tests/schema/schema.test.mjs",
        "branch-only.txt"
      ]
    }
  }, null, 2)}\n`);
  write(repo, "src/spec.md", "baseline source\n");
  write(repo, "tests/schema/pass/example.yaml", "baseline fixture\n");
  write(repo, "tests/schema/fail/example.yaml", "baseline invalid fixture\n");
  write(repo, "tests/schema/schema.test.mjs", "baseline runner\n");
  write(repo, "tests/schema/shared.mjs", "shared baseline\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "initial development content"]);
  runGit(repo, ["branch", "dev"]);
  runGit(repo, ["branch", "v12.34-dev"]);

  runGit(repo, ["switch", "main"]);
  runGit(repo, ["rm", "-r", "src", "tests/schema/pass", "tests/schema/fail", "tests/schema/schema.test.mjs"]);
  writeFileSync(join(repo, "tests/schema/shared.mjs"), "shared from main\n");
  write(repo, "branch-only.txt", "must not flow into development branches\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "publish release and update shared support"]);

  runGit(repo, ["switch", "dev"]);
  writeFileSync(join(repo, "src/spec.md"), "development source\n");
  writeFileSync(join(repo, "tests/schema/pass/example.yaml"), "development fixture\n");
  writeFileSync(join(repo, "tests/schema/schema.test.mjs"), "development runner\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "advance development content"]);

  runGit(repo, ["switch", "v12.34-dev"]);
  writeFileSync(join(repo, "src/spec.md"), "version source\n");
  writeFileSync(join(repo, "tests/schema/pass/example.yaml"), "version fixture\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "advance version content"]);

  for (const branch of ["main", "dev", "v12.34-dev"]) {
    runGit(repo, ["push", "origin", branch]);
  }
  runGit(repo, ["fetch", "origin"]);
  return repo;
}

function write(repo, path, contents) {
  const target = join(repo, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function read(repo, path) {
  return readFileSync(join(repo, path), "utf8");
}

function runGit(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function runNode(cwd, args) {
  try {
    return execFileSync(process.execPath, args, { cwd, encoding: "utf8" }).trim();
  } catch (error) {
    throw new Error(`${error.stdout || ""}${error.stderr || ""}` || error.message);
  }
}
