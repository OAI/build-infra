#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { parseReleaseVersion } from "../src/release/version.mjs";

const BUILD_INFRA_URL = "git+https://github.com/OAI/build-infra.git";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function updateConsumerRelease({
  consumer,
  releaseTag,
  packageVersion = readPackageVersion(packageRoot),
}) {
  const release = releaseFromTag(releaseTag);
  if (release.version !== packageVersion) {
    throw new Error(
      `Release tag ${releaseTag} does not match build-infra package version ${packageVersion}`,
    );
  }

  const consumerRoot = resolve(consumer);
  const packageJsonPath = join(consumerRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const current = packageJson.dependencies?.["@oai/build-infra"];

  if (
    typeof current !== "string" ||
    !current.startsWith(`${BUILD_INFRA_URL}#`)
  ) {
    throw new Error(
      `${packageJsonPath} does not use ${BUILD_INFRA_URL} as a dependency`,
    );
  }

  const dependency = `${BUILD_INFRA_URL}#semver:^${release.version}`;
  const changed = current !== dependency;
  if (changed) {
    packageJson.dependencies["@oai/build-infra"] = dependency;
    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  }

  return { changed, dependency, version: release.version };
}

function releaseFromTag(tag) {
  if (typeof tag !== "string" || !tag.startsWith("v")) {
    throw new Error("--release-tag must have the canonical form vX.Y.Z");
  }

  const release = parseReleaseVersion(tag.slice(1));
  if (!release) {
    throw new Error("--release-tag must have the canonical form vX.Y.Z");
  }
  return release;
}

function readPackageVersion(root) {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
}

function parseOptions(args) {
  const { values } = parseArgs({
    args,
    options: {
      consumer: { type: "string", default: "." },
      "package-version": { type: "string" },
      "release-tag": { type: "string" },
    },
    strict: true,
  });

  if (!values["release-tag"]) {
    throw new Error("--release-tag is required");
  }

  return {
    consumer: values.consumer,
    packageVersion: values["package-version"],
    releaseTag: values["release-tag"],
  };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    const update = updateConsumerRelease(parseOptions(process.argv.slice(2)));
    console.log(
      `${update.changed ? "Updated" : "Already using"} ${update.dependency}`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
