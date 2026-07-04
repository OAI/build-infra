import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

describe("shell command bin resolution", () => {
  test("markdown commands can use consumer-level hoisted bins", () => {
    const root = mkdtempSync(join(tmpdir(), "oai-bin-resolution-"));
    testDirs.push(root);

    const consumer = join(root, "consumer");
    const installedPackage = join(consumer, "node_modules/@oai/build-infra");
    const consumerBin = join(consumer, "node_modules/.bin");

    mkdirSync(installedPackage, { recursive: true });
    mkdirSync(consumerBin, { recursive: true });
    cpSync(join(packageRoot, "bin"), join(installedPackage, "bin"), { recursive: true });
    cpSync(join(packageRoot, "configs"), join(installedPackage, "configs"), { recursive: true });
    cpSync(join(packageRoot, "src/shell"), join(installedPackage, "src/shell"), { recursive: true });

    writeFileSync(join(consumer, "spec.config.json"), JSON.stringify({ specSrc: "spec.md" }));
    writeFileSync(join(consumer, "README.md"), "# Fixture\n");
    writeFileSync(join(consumer, ".linkspector.yml"), "dirs:\n  - .\n");
    writeBin(join(consumerBin, "markdownlint-cli2"), "echo markdownlint \"$@\"");
    writeBin(join(consumerBin, "linkspector"), "echo linkspector \"$@\"");

    const output = execFileSync("bash", [join(installedPackage, "bin/oai-spec-validate-markdown")], {
      cwd: consumer,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${consumerBin}:${process.env.PATH}`
      }
    });

    expect(output).toContain("markdownlint --config");
    expect(output).toContain("linkspector check --config");
  });
});

function writeBin(path, script) {
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${script}\n`);
  chmodSync(path, 0o755);
}
