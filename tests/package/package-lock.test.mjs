import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { describe, expect, test } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../..");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const lockfile = JSON.parse(readFileSync(join(packageRoot, "package-lock.json"), "utf8"));

describe("package lockfile", () => {
  test("uses package-lock v3", () => {
    expect(lockfile.lockfileVersion).toBe(3);
  });

  test("records the package's direct runtime dependencies", () => {
    expect(lockfile.packages[""].dependencies).toEqual(packageJson.dependencies);
  });
});
