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
  test("validate-markdown checks spec markdown, root markdown, and configured links", () => {
    const { consumer, installedPackage, consumerBin } = createInstalledPackageFixture();

    mkdirSync(join(consumer, "src"), { recursive: true });
    writeFileSync(join(consumer, "src/spec.md"), "# Fixture Spec\n");
    writeFileSync(join(consumer, "README.md"), "# Fixture\n");
    writeFileSync(join(consumer, ".linkspector.yml"), "dirs:\n  - .\n");
    writeBin(join(consumerBin, "markdownlint-cli2"), "echo markdownlint \"$@\"");
    writeBin(join(consumerBin, "linkspector"), "echo linkspector \"$@\"");

    const output = execFileSync(join(installedPackage, "bin/oai-spec-validate-markdown"), [], {
      cwd: consumer,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${consumerBin}:${process.env.PATH}`
      }
    });

    expect(output).toContain("markdownlint --config");
    expect(output).toContain("markdownlint-spec.yaml");
    expect(output).toContain("src/spec.md");
    expect(output).toContain("markdownlint-root.yaml");
    expect(output).toContain("*.md");
    expect(output).toContain("linkspector check --config");
  });

  test("validate-markdown preloads the linkspector no-sandbox shim in GitHub Actions", () => {
    const { consumer, installedPackage, consumerBin } = createInstalledPackageFixture();

    writeFileSync(join(consumer, "README.md"), "# Fixture\n");
    writeFileSync(join(consumer, ".linkspector.yml"), "dirs:\n  - .\n");
    writeBin(join(consumerBin, "markdownlint-cli2"), "echo markdownlint \"$@\"");
    writeBin(join(consumerBin, "linkspector"), "echo NODE_OPTIONS=\"$NODE_OPTIONS\"\necho linkspector \"$@\"");

    const output = execFileSync(join(installedPackage, "bin/oai-spec-validate-markdown"), [], {
      cwd: consumer,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_ACTIONS: "true",
        PATH: `${consumerBin}:${process.env.PATH}`
      }
    });

    expect(output).toContain("linkspector-no-sandbox.cjs");
    expect(output).toContain("linkspector check --config");
  });

  test("validate-markdown can disable the linkspector no-sandbox shim", () => {
    const { consumer, installedPackage, consumerBin } = createInstalledPackageFixture();

    writeFileSync(join(consumer, "README.md"), "# Fixture\n");
    writeFileSync(join(consumer, ".linkspector.yml"), "dirs:\n  - .\n");
    writeBin(join(consumerBin, "markdownlint-cli2"), "echo markdownlint \"$@\"");
    writeBin(join(consumerBin, "linkspector"), "echo NODE_OPTIONS=\"$NODE_OPTIONS\"\necho linkspector \"$@\"");

    const output = execFileSync(join(installedPackage, "bin/oai-spec-validate-markdown"), [], {
      cwd: consumer,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_ACTIONS: "true",
        OAI_BUILD_INFRA_LINKSPECTOR_NO_SANDBOX: "0",
        PATH: `${consumerBin}:${process.env.PATH}`
      }
    });

    expect(output).not.toContain("linkspector-no-sandbox.cjs");
    expect(output).toContain("linkspector check --config");
  });

  test("validate-markdown skips linkspector when no linkspector config exists", () => {
    const { consumer, installedPackage, consumerBin } = createInstalledPackageFixture();

    writeFileSync(join(consumer, "README.md"), "# Fixture\n");
    writeBin(join(consumerBin, "markdownlint-cli2"), "echo markdownlint \"$@\"");
    writeBin(join(consumerBin, "linkspector"), "echo linkspector \"$@\"");

    const output = execFileSync(join(installedPackage, "bin/oai-spec-validate-markdown"), [], {
      cwd: consumer,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${consumerBin}:${process.env.PATH}`
      }
    });

    expect(output).toContain("markdownlint --config");
    expect(output).not.toContain("linkspector");
  });

  test("format-markdown uses the same lint configs with fix mode", () => {
    const { consumer, installedPackage, consumerBin } = createInstalledPackageFixture();

    mkdirSync(join(consumer, "src"), { recursive: true });
    writeFileSync(join(consumer, "src/spec.md"), "# Fixture Spec\n");
    writeFileSync(join(consumer, "README.md"), "# Fixture\n");
    writeBin(join(consumerBin, "markdownlint-cli2"), "echo markdownlint \"$@\"");

    const output = execFileSync(join(installedPackage, "bin/oai-spec-format-markdown"), [], {
      cwd: consumer,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${consumerBin}:${process.env.PATH}`
      }
    });

    expect(output).toContain("markdownlint-spec.yaml --fix src/spec.md");
    expect(output).toContain("markdownlint-root.yaml --fix *.md");
  });
});

function createInstalledPackageFixture() {
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

  return { consumer, installedPackage, consumerBin };
}

function writeBin(path, script) {
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${script}\n`);
  chmodSync(path, 0o755);
}
