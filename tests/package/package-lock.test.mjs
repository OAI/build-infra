import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { describe, expect, test } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../..");
const lockfile = JSON.parse(readFileSync(join(packageRoot, "package-lock.json"), "utf8"));

describe("package lockfile", () => {
  test("includes optional dependency entries required by npm ci on Linux", () => {
    expectPackage("node_modules/@emnapi/core", "1.11.2");
    expectPackage("node_modules/@emnapi/runtime", "1.11.2");
    expectPackage("node_modules/@rolldown/binding-wasm32-wasi/node_modules/@emnapi/core", "1.11.1");
    expectPackage("node_modules/@rolldown/binding-wasm32-wasi/node_modules/@emnapi/runtime", "1.11.1");
  });

  test("records the proxy dependency tree expected by ReSpec", () => {
    expectPackage("node_modules/proxy-agent", "8.0.2");
    expectPackage("node_modules/agent-base", "9.0.0");
    expectPackage("node_modules/http-proxy-agent", "9.1.0");
    expectPackage("node_modules/https-proxy-agent", "9.1.0");
    expectPackage("node_modules/pac-proxy-agent", "9.1.0");
    expectPackage("node_modules/proxy-agent-negotiate", "1.1.0");
    expectPackage("node_modules/respec/node_modules/proxy-agent", "6.5.0");
  });
});

function expectPackage(path, version) {
  expect(lockfile.packages[path]?.version, `${path} should be locked`).toBe(version);
}
