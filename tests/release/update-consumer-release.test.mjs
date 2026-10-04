import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { updateConsumerRelease } from "../../scripts/update-consumer-release.mjs";

const testDirectories = [];

afterEach(() => {
  while (testDirectories.length > 0) {
    rmSync(testDirectories.pop(), { recursive: true, force: true });
  }
});

describe("consumer release updates", () => {
  test("replaces a main dependency with the released semantic-version range", () => {
    const consumer = createConsumer(
      "git+https://github.com/OAI/build-infra.git#main",
    );

    const update = updateConsumerRelease({
      consumer,
      releaseTag: "v2.3.4",
      packageVersion: "2.3.4",
    });

    expect(update).toEqual({
      changed: true,
      dependency:
        "git+https://github.com/OAI/build-infra.git#semver:^2.3.4",
      version: "2.3.4",
    });
    expect(readDependency(consumer)).toBe(update.dependency);
  });

  test("provides the update through the workflow command line", () => {
    const consumer = createConsumer(
      "git+https://github.com/OAI/build-infra.git#main",
    );

    const output = execFileSync(
      process.execPath,
      [
        resolve("scripts/update-consumer-release.mjs"),
        `--consumer=${consumer}`,
        "--release-tag=v2.3.4",
        "--package-version=2.3.4",
      ],
      { encoding: "utf8" },
    );

    expect(output.trim()).toBe(
      "Updated git+https://github.com/OAI/build-infra.git#semver:^2.3.4",
    );
    expect(readDependency(consumer)).toBe(
      "git+https://github.com/OAI/build-infra.git#semver:^2.3.4",
    );
  });

  test("advances an existing release range", () => {
    const consumer = createConsumer(
      "git+https://github.com/OAI/build-infra.git#semver:^1.0.2",
    );

    const update = updateConsumerRelease({
      consumer,
      releaseTag: "v1.1.0",
      packageVersion: "1.1.0",
    });

    expect(update.changed).toBe(true);
    expect(readDependency(consumer)).toBe(
      "git+https://github.com/OAI/build-infra.git#semver:^1.1.0",
    );
  });

  test("is idempotent for an already updated consumer", () => {
    const dependency =
      "git+https://github.com/OAI/build-infra.git#semver:^1.1.0";
    const consumer = createConsumer(dependency);

    const update = updateConsumerRelease({
      consumer,
      releaseTag: "v1.1.0",
      packageVersion: "1.1.0",
    });

    expect(update.changed).toBe(false);
    expect(readDependency(consumer)).toBe(dependency);
  });

  test.each(["1.2.3", "v1.2", "v1.2.3-beta.1", "v01.2.3"])(
    "rejects noncanonical release tag %s",
    (releaseTag) => {
      const consumer = createConsumer(
        "git+https://github.com/OAI/build-infra.git#main",
      );

      expect(() =>
        updateConsumerRelease({
          consumer,
          releaseTag,
          packageVersion: "1.2.3",
        }),
      ).toThrow("--release-tag must have the canonical form vX.Y.Z");
    },
  );

  test("rejects a tag that does not match the checked-out package", () => {
    const consumer = createConsumer(
      "git+https://github.com/OAI/build-infra.git#main",
    );

    expect(() =>
      updateConsumerRelease({
        consumer,
        releaseTag: "v1.2.3",
        packageVersion: "1.2.4",
      }),
    ).toThrow(
      "Release tag v1.2.3 does not match build-infra package version 1.2.4",
    );
  });

  test("rejects a dependency from another repository", () => {
    const consumer = createConsumer(
      "git+https://github.com/example/build-infra.git#main",
    );

    expect(() =>
      updateConsumerRelease({
        consumer,
        releaseTag: "v1.2.3",
        packageVersion: "1.2.3",
      }),
    ).toThrow("does not use git+https://github.com/OAI/build-infra.git");
  });
});

function createConsumer(dependency) {
  const root = mkdtempSync(join(tmpdir(), "oai-consumer-release-"));
  testDirectories.push(root);
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "consumer-fixture",
        private: true,
        dependencies: { "@oai/build-infra": dependency },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

function readDependency(consumer) {
  const packageJson = JSON.parse(
    readFileSync(join(consumer, "package.json"), "utf8"),
  );
  return packageJson.dependencies["@oai/build-infra"];
}
