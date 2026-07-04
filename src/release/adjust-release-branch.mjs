import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import {
  currentBranch,
  editorsSnapshotPath,
  loadReleaseConfig,
  parseArgs,
  publishedSpecPath,
  removeConfiguredPaths,
  requireCleanWorktree,
  today
} from "./common.mjs";

export async function adjustReleaseBranch(args = []) {
  const options = parseArgs(args);
  const config = loadReleaseConfig(options.configFile);
  const branch = currentBranch();
  const match = branch.match(/^v([0-9]+\.[0-9]+\.[0-9]+)-rel$/);

  if (!match) {
    throw new Error("This command is intended to be run from a release branch, e.g. v3.1.2-rel");
  }

  requireCleanWorktree();

  const version = match[1];
  const releaseDate = today();
  const targetSpec = publishedSpecPath(config, version);

  console.log(`=== Prepare release of ${version}`);
  console.log(`=== Copy ${config.sourcePath} to ${targetSpec}`);

  const source = readFileSync(config.sourcePath, "utf8");
  writeFileSync(targetSpec, source.replaceAll("| TBD |", `| ${releaseDate} |`));

  if (config.editorsPath) {
    const targetEditors = editorsSnapshotPath(config, version);
    console.log(`=== Copy ${config.editorsPath} to ${targetEditors}`);
    copyFileSync(config.editorsPath, targetEditors);
  }

  if (config.removeOnReleaseBranch.length > 0) {
    console.log("=== Remove development-only files");
    removeConfiguredPaths(config.removeOnReleaseBranch);
  }

  console.log("=== Done");
}
