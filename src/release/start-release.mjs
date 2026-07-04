import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  compareVersions,
  currentBranch,
  expandFiles,
  findRemote,
  git,
  listPublishedSpecs,
  loadReleaseConfig,
  parseArgs,
  replaceVersionAndHistory,
  remoteBranchExists,
  requireCleanWorktree,
  rewriteVersionInFiles
} from "./common.mjs";

export async function startRelease(args = []) {
  const options = parseArgs(args);
  const config = loadReleaseConfig(options.configFile);
  const branch = currentBranch();
  const match = branch.match(/^v([0-9]+\.[0-9]+)-dev$/);

  if (!match) {
    throw new Error("This command is intended to be run from a development branch, e.g. v3.2-dev");
  }

  requireCleanWorktree();

  const minor = match[1];
  const remote = findRemote(config);
  const mainRef = `${remote}/${config.mainBranch}`;
  const publishedSpecs = listPublishedSpecs(mainRef, config.versionsDir).sort(compareVersions);
  const sameMinor = publishedSpecs.filter((path) => path.match(new RegExp(`/${minor}\\.[0-9]+\\.md$`)));

  let lastSpec;
  let nextPatch;
  let releaseType;
  if (sameMinor.length > 0) {
    lastSpec = sameMinor.at(-1);
    nextPatch = Number(lastSpec.match(/\.([0-9]+)\.md$/)[1]) + 1;
    releaseType = "Patch release";
  } else {
    lastSpec = publishedSpecs.at(-1);
    nextPatch = 0;
    releaseType = "Release";
  }

  if (!lastSpec) {
    throw new Error(`Could not find any published specification version in ${mainRef}:${config.versionsDir}`);
  }

  const lastVersion = lastSpec.match(/([0-9]+\.[0-9]+\.[0-9]+)\.md$/)[1];
  const nextVersion = `${minor}.${nextPatch}`;
  const prBranch = `${branch}-start-${nextVersion}`;
  const orphan = `v${minor}-orphan`;

  console.log(`=== Initialize ${config.sourcePath} for ${nextVersion} from ${lastVersion}`);

  if (remoteBranchExists(remote, prBranch)) {
    throw new Error(`PR branch ${prBranch} already exists on ${remote}`);
  }

  git(["checkout", "-b", prBranch], { stdio: "inherit" });

  try {
    git(["switch", "--orphan", orphan], { stdio: "inherit" });
    mkdirSync(dirname(config.sourcePath), { recursive: true });
    writeFileSync(config.sourcePath, git(["show", `${mainRef}:${lastSpec}`]) + "\n");
    git(["add", config.sourcePath], { stdio: "inherit" });
    git(["commit", "-m", `copy from ${lastVersion}`], { stdio: "inherit" });

    git(["switch", prBranch], { stdio: "inherit" });
    git(["merge", orphan, "-X", "theirs", "--allow-unrelated-histories", "-m", `reset ${config.sourcePath} history`], { stdio: "inherit" });
    git(["branch", "-D", orphan], { stdio: "inherit" });

    const source = readFileSync(config.sourcePath, "utf8");
    writeFileSync(config.sourcePath, replaceVersionAndHistory(source, lastVersion, nextVersion, releaseType, config));
    git(["add", config.sourcePath], { stdio: "inherit" });
    git(["commit", "-m", "bump version"], { stdio: "inherit" });

    console.log(`=== Initialized ${config.sourcePath}`);

    if (nextPatch === 0 && config.schemaVersionRewrite.enabled) {
      const lastMinor = lastVersion.split(".").slice(0, 2).join(".");
      const paths = expandFiles(config.schemaVersionRewrite.paths || []);
      if (paths.length > 0) {
        console.log(`=== Adjust schema-related files for new version ${minor}`);
        rewriteVersionInFiles(paths, lastMinor, minor);
        git(["add", ...paths], { stdio: "inherit" });
        git(["commit", "-m", "adjust schemas, test script, and test data"], { stdio: "inherit" });
      }
    }

    if (options.push) {
      git(["push", "-u", remote, prBranch], { stdio: "inherit" });
    } else {
      console.log(`=== Skipped push of ${prBranch}`);
    }
  } catch (error) {
    try {
      git(["switch", branch], { stdio: "inherit" });
    } catch {
      // Leave the checkout where it is if recovery is not possible.
    }
    throw error;
  }

  git(["switch", branch], { stdio: "inherit" });
  console.log("=== Done");
}
