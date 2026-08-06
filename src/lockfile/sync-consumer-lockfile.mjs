import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

export function syncConsumerLockfile(args = []) {
  const lockfilePath = resolve(args[0] || "package-lock.json");
  const consumerLock = JSON.parse(readFileSync(lockfilePath, "utf8"));
  const consumerRoot = consumerLock.packages?.[""];
  const buildInfraPackage = consumerLock.packages?.["node_modules/@oai/build-infra"];

  if (!consumerRoot) {
    throw new Error(`Could not find root package entry in ${lockfilePath}`);
  }

  if (!buildInfraPackage) {
    throw new Error(`Could not find node_modules/@oai/build-infra entry in ${lockfilePath}`);
  }

  const requireFromConsumer = createRequire(`${dirname(lockfilePath)}/`);
  const buildInfraPackageJson = requireFromConsumer.resolve("@oai/build-infra/package.json");
  const buildInfraPackageDir = dirname(buildInfraPackageJson);
  const buildInfraLockfilePath = findBuildInfraLockfile(buildInfraPackageDir);
  const buildInfraLock = JSON.parse(readFileSync(buildInfraLockfilePath, "utf8"));

  for (const [path, entry] of Object.entries(buildInfraLock.packages || {})) {
    if (path) {
      consumerLock.packages[path] = entry;
    }
  }

  consumerLock.packages[""] = consumerRoot;
  consumerLock.packages["node_modules/@oai/build-infra"] = buildInfraPackage;

  consumerLock.packages = Object.fromEntries(
    Object.entries(consumerLock.packages).sort(([a], [b]) => a.localeCompare(b))
  );

  writeFileSync(lockfilePath, JSON.stringify(consumerLock, null, 2) + "\n");
}

function findBuildInfraLockfile(buildInfraPackageDir) {
  const candidates = [
    join(buildInfraPackageDir, "package-lock.json"),
    join(buildInfraPackageDir, "src/lockfile/build-infra-package-lock.json")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Could not find build-infra lockfile. Checked: ${candidates.join(", ")}`
  );
}
