import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("md2html build script", () => {
  test("builds 1.x published versions and minor aliases", () => {
    const repo = createBuildFixture();

    runBuild(repo);

    expect(existsSync(join(repo, "deploy/fixture/v1.1.0.html"))).toBe(true);
    expect(existsSync(join(repo, "deploy/fixture/v1.0.1.html"))).toBe(true);
    expect(lstatSync(join(repo, "deploy/fixture/v1.1.html")).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(repo, "deploy/fixture/v1.0.html")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(repo, "deploy/fixture/v1.1.0.html"), "utf8")).toContain("Fixture Maintainer");
  });

  test("uses configured source maintainer path for source builds", () => {
    const repo = createBuildFixture();

    runBuild(repo, ["src"]);

    const html = readFileSync(join(repo, "deploy-preview/spec.html"), "utf8");
    expect(html).toContain("Source Editor");
    expect(html).not.toContain("Fixture Maintainer");
  });

  test("treats ReSpec errors as build failures", () => {
    const repo = createBuildFixture();

    expect(() => runBuild(repo, ["src"], { FIXTURE_RESPEC_ERROR: "1" }))
      .toThrow(/ReSpec fixture error/);
  });
});

function createBuildFixture() {
  const repo = mkdtempSync(join(tmpdir(), "oai-md2html-build-"));
  testDirs.push(repo);

  mkdirSync(join(repo, "versions"), { recursive: true });
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, "node_modules/.bin"), { recursive: true });
  mkdirSync(join(repo, "node_modules/respec/builds"), { recursive: true });

  writeFileSync(join(repo, "spec.config.json"), JSON.stringify({
    slug: "fixture",
    shortName: "Fixture",
    specSrc: "spec.md",
    edDraftURI: "https://github.com/OAI/fixture/",
    maintainersPath: "MAINTAINERS.md",
    sourceMaintainersPath: "SOURCE_EDITORS.md",
    publishedMaintainersPath: "MAINTAINERS.md"
  }));
  writeFileSync(join(repo, "MAINTAINERS.md"), "# Maintainers\n\n- Fixture Maintainer @fixture\n");
  writeFileSync(join(repo, "SOURCE_EDITORS.md"), "# Editors\n\n- Source Editor @source\n");
  writeFileSync(join(repo, "versions/1.0.0.md"), specMarkdown("1.0.0", "2024-01-01"));
  writeFileSync(join(repo, "versions/1.0.1.md"), specMarkdown("1.0.1", "2024-06-01"));
  writeFileSync(join(repo, "versions/1.1.0.md"), specMarkdown("1.1.0", "2025-01-01"));
  writeFileSync(join(repo, "src/spec.md"), specMarkdown("1.2.0", "TBA"));
  writeFileSync(join(repo, "node_modules/respec/package.json"), JSON.stringify({ name: "respec", version: "0.0.0" }));
  writeFileSync(join(repo, "node_modules/respec/builds/respec-w3c.js"), "/* respec fixture */\n");
  writeBin(join(repo, "node_modules/.bin/respec"), "halt=false; while [ \"$#\" -gt 0 ]; do case \"$1\" in --haltonerror) halt=true; shift ;; --src) src=\"$2\"; shift 2 ;; --out) out=\"$2\"; shift 2 ;; *) shift ;; esac; done; if [ \"${FIXTURE_RESPEC_ERROR:-0}\" = 1 ] && [ \"$halt\" = true ]; then echo 'ReSpec fixture error' >&2; exit 1; fi; cp \"$src\" \"$out\"");

  return repo;
}

function specMarkdown(version, date) {
  return `# Fixture Specification\n\n## Version ${version}\n\n| Version | Date | Notes |\n| ---- | ---- | ---- |\n| ${version} | ${date} | Fixture release |\n`;
}

function runBuild(repo, args = [], env = {}) {
  return execFileSync("bash", [join(packageRoot, "src/md2html/build.sh"), ...args], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      PATH: `${join(repo, "node_modules/.bin")}:${process.env.PATH}`
    }
  });
}

function writeBin(path, script) {
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${script}\n`);
  chmodSync(path, 0o755);
}
