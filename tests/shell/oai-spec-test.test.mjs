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

describe("oai-spec-test", () => {
  test("runs c8 and vitest from a package checkout layout", () => {
    const fixture = createPackageCheckoutFixture();

    const output = execFileSync(join(fixture, "bin/oai-spec-test"), ["--runInBand"], {
      cwd: fixture,
      encoding: "utf8"
    });

    expect(output).toContain("c8 --100");
    expect(output).toContain("vitest/vitest.mjs run --coverage --runInBand");
  });
});

function createPackageCheckoutFixture() {
  const root = mkdtempSync(join(tmpdir(), "oai-spec-test-checkout-"));
  testDirs.push(root);

  mkdirSync(join(root, "bin"), { recursive: true });
  cpSync(join(packageRoot, "bin/oai-spec-test"), join(root, "bin/oai-spec-test"));
  chmodSync(join(root, "bin/oai-spec-test"), 0o755);

  mkdirSync(join(root, "node_modules/c8/bin"), { recursive: true });
  writeFileSync(join(root, "node_modules/c8/package.json"), JSON.stringify({ name: "c8", version: "0.0.0" }));
  writeFileSync(join(root, "node_modules/c8/bin/c8.js"), "console.log(`c8 ${process.argv.slice(2).join(' ')}`);\n");

  mkdirSync(join(root, "node_modules/vitest"), { recursive: true });
  writeFileSync(join(root, "node_modules/vitest/package.json"), JSON.stringify({ name: "vitest", version: "0.0.0" }));
  writeFileSync(join(root, "node_modules/vitest/vitest.mjs"), "console.log('vitest fixture');\n");

  return root;
}
