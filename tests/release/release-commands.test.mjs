import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../..");
const startReleaseBin = join(packageRoot, "bin/oai-spec-start-release");
const adjustReleaseBranchBin = join(packageRoot, "bin/oai-spec-adjust-release-branch");
const testDirs = [];

afterEach(() => {
  while (testDirs.length > 0) {
    rmSync(testDirs.pop(), { recursive: true, force: true });
  }
});

describe("release command behavior in fixture repositories", () => {
  test("starts the next patch release branch from published versions on main", async () => {
    const { repo } = await createFixtureRepository({
      mainSpecVersion: "1.0.0",
      devBranch: "v1.0-dev"
    });

    runGit(repo, ["switch", "v1.0-dev"]);
    runNode(repo, [startReleaseBin, "--no-push"]);

    expect(runGit(repo, ["branch", "--show-current"])).toBe("v1.0-dev");
    expect(runGit(repo, ["rev-parse", "--verify", "v1.0-dev-start-1.0.1"])).toBeTruthy();

    runGit(repo, ["switch", "v1.0-dev-start-1.0.1"]);
    const source = readFileSync(join(repo, "src/spec.md"), "utf8");
    expect(source).toContain("## Version 1.0.1");
    expect(source).toContain("| 1.0.1 | TBD | Patch release Example Specification 1.0.1 |");
  });

  test("starts a new minor release branch and rewrites configured schema files", async () => {
    const { repo } = await createFixtureRepository({
      mainSpecVersion: "1.0.4",
      devBranch: "v1.1-dev",
      schemaText: [
        "openapi: 3.1.0",
        "info:",
        "  title: Example",
        "  version: 1.0.4",
        "x-oai-version: 1.0",
        "pattern: '^1\\.0\\.'",
        ""
      ].join("\n")
    });

    runGit(repo, ["switch", "v1.1-dev"]);
    runNode(repo, [startReleaseBin, "--no-push"]);

    expect(runGit(repo, ["branch", "--show-current"])).toBe("v1.1-dev");
    expect(runGit(repo, ["rev-parse", "--verify", "v1.1-dev-start-1.1.0"])).toBeTruthy();

    runGit(repo, ["switch", "v1.1-dev-start-1.1.0"]);
    const source = readFileSync(join(repo, "src/spec.md"), "utf8");
    const schema = readFileSync(join(repo, "src/schemas/validation/schema.yaml"), "utf8");

    expect(source).toContain("## Version 1.1.0");
    expect(source).toContain("| 1.1.0 | TBD | Release Example Specification 1.1.0 |");
    expect(schema).toContain("x-oai-version: 1.1");
    expect(schema).toContain("pattern: '^1\\.1\\.'");
  });

  test("prepares a release branch for merge to main", async () => {
    const { repo } = await createFixtureRepository({
      mainSpecVersion: "1.0.0",
      devBranch: "v1.0-dev"
    });

    runGit(repo, ["switch", "-c", "v1.0.1-rel", "v1.0-dev"]);
    writeFileSync(join(repo, "src/spec.md"), fixtureSpec("1.0.1", "Patch release"));
    runGit(repo, ["add", "src/spec.md"]);
    runGit(repo, ["commit", "-m", "prepare 1.0.1 release"]);
    const releaseHead = runGit(repo, ["rev-parse", "HEAD"]);
    const output = runNode(repo, [adjustReleaseBranchBin]);

    const today = new Date().toISOString().slice(0, 10);
    const published = readFileSync(join(repo, "versions/1.0.1.md"), "utf8");
    const editors = readFileSync(join(repo, "versions/1.0.1-editors.md"), "utf8");

    expect(published).toContain(`| 1.0.1 | ${today} | Patch release Example Specification 1.0.1 |`);
    expect(published).not.toContain("| TBD |");
    expect(editors).toContain("# Editors");
    expect(existsSync(join(repo, "src"))).toBe(false);
    expect(existsSync(join(repo, "tests/schema/pass"))).toBe(false);
    expect(existsSync(join(repo, "tests/schema/fail"))).toBe(false);
    expect(existsSync(join(repo, "tests/schema/schema.test.mjs"))).toBe(false);
    expect(runGit(repo, ["rev-parse", "HEAD"])).toBe(releaseHead);
    expect(runGit(repo, ["ls-files", "--error-unmatch", "versions/1.0.1.md"]))
      .toBe("versions/1.0.1.md");
    expect(runGit(repo, ["ls-files", "--error-unmatch", "versions/1.0.1-editors.md"]))
      .toBe("versions/1.0.1-editors.md");
    expect(runGit(repo, ["diff", "--name-only"])).toBe("");
    expect(runGit(repo, ["status", "--porcelain"])).not.toMatch(/^\?\?/m);
    expect(output).toContain("Release changes have been staged for review.");
    expect(output).toContain("After making manual edits, run: git add --all");
  });

  test("start-release fails outside a development branch", async () => {
    const { repo } = await createFixtureRepository({
      mainSpecVersion: "1.0.0",
      devBranch: "v1.0-dev"
    });

    runGit(repo, ["switch", "main"]);

    expect(() => runNode(repo, [startReleaseBin, "--no-push"])).toThrow(
      /intended to be run from a development branch/
    );
  });

  test("release commands require a clean worktree", async () => {
    const { repo } = await createFixtureRepository({
      mainSpecVersion: "1.0.0",
      devBranch: "v1.0-dev"
    });

    runGit(repo, ["switch", "v1.0-dev"]);
    writeFileSync(join(repo, "UNCOMMITTED.md"), "# local edit\n");

    expect(() => runNode(repo, [startReleaseBin, "--no-push"])).toThrow(
      /Working tree must be clean/
    );
  });

  test("start-release fails when main has no published versions", async () => {
    const { repo } = await createFixtureRepositoryWithoutPublishedVersions("v1.0-dev");

    runGit(repo, ["switch", "v1.0-dev"]);

    expect(() => runNode(repo, [startReleaseBin, "--no-push"])).toThrow(
      /Could not find any published specification version/
    );
  });

  test("start-release refuses to reuse an existing remote PR branch", async () => {
    const { repo } = await createFixtureRepository({
      mainSpecVersion: "1.0.0",
      devBranch: "v1.0-dev"
    });

    runGit(repo, ["switch", "-c", "v1.0-dev-start-1.0.1"]);
    runGit(repo, ["push", "-u", "origin", "v1.0-dev-start-1.0.1"]);
    runGit(repo, ["switch", "v1.0-dev"]);

    expect(() => runNode(repo, [startReleaseBin, "--no-push"])).toThrow(
      /PR branch v1\.0-dev-start-1\.0\.1 already exists/
    );
  });
});

async function createFixtureRepository({ mainSpecVersion, devBranch, schemaText }) {
  const root = mkdtempSync(join(tmpdir(), "oai-build-infra-test-"));
  testDirs.push(root);

  const remote = join(root, "remote.git");
  const repo = join(root, "consumer");

  runGit(root, ["init", "--bare", remote]);
  runGit(root, ["init", repo]);
  runGit(repo, ["branch", "-M", "main"]);
  runGit(repo, ["config", "user.name", "Fixture Maintainer"]);
  runGit(repo, ["config", "user.email", "fixture@example.com"]);
  runGit(repo, ["remote", "add", "origin", remote]);

  await writeFixtureFiles(repo, mainSpecVersion, schemaText);
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", `publish ${mainSpecVersion}`]);
  runGit(repo, ["push", "-u", "origin", "main"]);

  runGit(repo, ["switch", "-c", devBranch]);
  writeFileSync(join(repo, "src/spec.md"), fixtureSpec(mainSpecVersion));
  runGit(repo, ["add", "src/spec.md"]);
  runGit(repo, ["commit", "--allow-empty", "-m", "start development branch"]);

  return { repo, remote };
}

async function createFixtureRepositoryWithoutPublishedVersions(devBranch) {
  const root = mkdtempSync(join(tmpdir(), "oai-build-infra-test-"));
  testDirs.push(root);

  const remote = join(root, "remote.git");
  const repo = join(root, "consumer");

  runGit(root, ["init", "--bare", remote]);
  runGit(root, ["init", repo]);
  runGit(repo, ["branch", "-M", "main"]);
  runGit(repo, ["config", "user.name", "Fixture Maintainer"]);
  runGit(repo, ["config", "user.email", "fixture@example.com"]);
  runGit(repo, ["remote", "add", "origin", remote]);

  await mkdir(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "spec.config.json"), JSON.stringify(fixtureConfig(), null, 2) + "\n");
  writeFileSync(join(repo, "src/spec.md"), fixtureSpec("1.0.0"));
  writeFileSync(join(repo, "EDITORS.md"), "# Editors\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "initial repository"]);
  runGit(repo, ["push", "-u", "origin", "main"]);
  runGit(repo, ["switch", "-c", devBranch]);

  return { repo, remote };
}

async function writeFixtureFiles(repo, version, schemaText) {
  await mkdir(join(repo, "src/schemas/validation"), { recursive: true });
  await mkdir(join(repo, "tests/schema/pass"), { recursive: true });
  await mkdir(join(repo, "tests/schema/fail"), { recursive: true });
  await mkdir(join(repo, "versions"), { recursive: true });

  writeFileSync(join(repo, "spec.config.json"), JSON.stringify(fixtureConfig(), null, 2) + "\n");
  writeFileSync(join(repo, "EDITORS.md"), "# Editors\n\n- Example Editor\n");
  writeFileSync(join(repo, "src/spec.md"), fixtureSpec(version));
  writeFileSync(join(repo, `versions/${version}.md`), fixtureSpec(version));
  writeFileSync(join(repo, "src/schemas/validation/schema.yaml"), schemaText || "x-oai-version: 1.0\n");
  writeFileSync(join(repo, "tests/schema/pass/example.yaml"), "openapi: 3.1.0\n");
  writeFileSync(join(repo, "tests/schema/fail/example.yaml"), "openapi: 3.1.0\n");
  writeFileSync(join(repo, "tests/schema/schema.test.mjs"), "const supportedVersion = '1.0';\n");
}

function fixtureConfig() {
  return {
    slug: "example",
    shortName: "Example",
    titleName: "Example Specification",
    specSrc: "spec.md",
    edDraftURI: "https://github.com/OAI/example",
    release: {
      remote: "origin",
      sourcePath: "src/spec.md",
      releaseHistoryNote: "$releaseType Example Specification $version",
      removeOnReleaseBranch: [
        "src",
        "tests/schema/pass",
        "tests/schema/fail",
        "tests/schema/schema.test.mjs"
      ],
      schemaVersionRewrite: {
        enabled: true,
        paths: [
          "src/schemas/validation/*.yaml",
          "tests/schema/schema.test.mjs",
          "tests/schema/pass/*.yaml",
          "tests/schema/fail/*.yaml"
        ]
      }
    }
  };
}

function fixtureSpec(version, releaseType = "Release") {
  return [
    "# Example Specification",
    "",
    `## Version ${version}`,
    "",
    "| Version | Date | Notes |",
    "| ---- | ---- | ---- |",
    `| ${version} | TBD | ${releaseType} Example Specification ${version} |`,
    "",
    "## Content",
    "",
    "Fixture content.",
    ""
  ].join("\n");
}

function runNode(cwd, args) {
  try {
    return execFileSync(process.execPath, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trimEnd();
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}`;
    throw new Error(output || error.message);
  }
}

function runGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trimEnd();
}
