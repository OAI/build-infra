import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { syncConsumerLockfile } from "../../src/lockfile/sync-consumer-lockfile.mjs";

const testDirs = [];

afterEach(() => {
  while (testDirs.length > 0) {
    rmSync(testDirs.pop(), { recursive: true, force: true });
  }
});

describe("consumer lockfile synchronization", () => {
  test("copies build-infra dependency entries while preserving consumer package entries", () => {
    const consumer = mkdtempSync(join(tmpdir(), "oai-lockfile-sync-"));
    testDirs.push(consumer);

    const installedPackage = join(consumer, "node_modules/@oai/build-infra");
    mkdirSync(installedPackage, { recursive: true });
    writeFileSync(join(installedPackage, "package.json"), JSON.stringify({
      name: "@oai/build-infra",
      version: "0.0.0"
    }));
    writeFileSync(join(installedPackage, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "@oai/build-infra", version: "0.0.0" },
        "node_modules/@emnapi/core": { version: "1.11.2" },
        "node_modules/proxy-agent": { version: "8.0.2" }
      }
    }));

    writeFileSync(join(consumer, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": {
          name: "consumer",
          dependencies: {
            "@oai/build-infra": "git+https://github.com/OAI/build-infra.git#main"
          }
        },
        "node_modules/@oai/build-infra": {
          version: "0.0.0",
          resolved: "git+https://github.com/OAI/build-infra.git#abc123"
        },
        "node_modules/proxy-agent": { version: "6.5.0" }
      }
    }));

    syncConsumerLockfile([join(consumer, "package-lock.json")]);

    const lockfile = JSON.parse(readFileSync(join(consumer, "package-lock.json"), "utf8"));

    expect(lockfile.packages[""].name).toBe("consumer");
    expect(lockfile.packages["node_modules/@oai/build-infra"].resolved).toBe(
      "git+https://github.com/OAI/build-infra.git#abc123"
    );
    expect(lockfile.packages["node_modules/@emnapi/core"].version).toBe("1.11.2");
    expect(lockfile.packages["node_modules/proxy-agent"].version).toBe("8.0.2");
  });

  test("uses the packaged lockfile snapshot when package-lock.json is not installed", () => {
    const consumer = mkdtempSync(join(tmpdir(), "oai-lockfile-sync-"));
    testDirs.push(consumer);

    const installedPackage = join(consumer, "node_modules/@oai/build-infra");
    mkdirSync(join(installedPackage, "src/lockfile"), { recursive: true });
    writeFileSync(join(installedPackage, "package.json"), JSON.stringify({
      name: "@oai/build-infra",
      version: "0.0.0"
    }));
    writeFileSync(join(installedPackage, "src/lockfile/build-infra-package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "@oai/build-infra", version: "0.0.0" },
        "node_modules/@emnapi/runtime": { version: "1.11.2" }
      }
    }));

    writeFileSync(join(consumer, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": {
          name: "consumer",
          dependencies: {
            "@oai/build-infra": "git+https://github.com/OAI/build-infra.git#main"
          }
        },
        "node_modules/@oai/build-infra": {
          version: "0.0.0",
          resolved: "git+https://github.com/OAI/build-infra.git#abc123"
        }
      }
    }));

    syncConsumerLockfile([join(consumer, "package-lock.json")]);

    const lockfile = JSON.parse(readFileSync(join(consumer, "package-lock.json"), "utf8"));

    expect(lockfile.packages[""].name).toBe("consumer");
    expect(lockfile.packages["node_modules/@oai/build-infra"].resolved).toBe(
      "git+https://github.com/OAI/build-infra.git#abc123"
    );
    expect(lockfile.packages["node_modules/@emnapi/runtime"].version).toBe("1.11.2");
  });
});
