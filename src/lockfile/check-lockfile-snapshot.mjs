#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const lockfilePath = resolve("package-lock.json");
const snapshotPath = resolve("src/lockfile/build-infra-package-lock.json");

const lockfile = JSON.parse(readFileSync(lockfilePath, "utf8"));
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));

if (!isDeepStrictEqual(snapshot, lockfile)) {
  console.error(`${snapshotPath} is out of sync with ${lockfilePath}.`);
  console.error("Run: npm run sync-lockfile-snapshot");
  process.exit(1);
}
