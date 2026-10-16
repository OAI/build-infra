import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_CONFIG = "spec.config.json";
const DEFAULT_LABEL = "Housekeeping";

export function parseSyncArgs(args) {
  const options = {
    autoMerge: false,
    base: null,
    basePattern: null,
    checkDelay: 60,
    configFile: process.env.SPEC_CONFIG || DEFAULT_CONFIG,
    head: null,
    label: DEFAULT_LABEL,
    openPullRequests: true,
    push: true,
    remote: "origin"
  };

  for (const arg of args) {
    if (arg === "--auto-merge") {
      options.autoMerge = true;
    } else if (arg === "--no-pr") {
      options.openPullRequests = false;
    } else if (arg === "--no-push") {
      options.push = false;
    } else if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
    } else if (arg.startsWith("--base-pattern=")) {
      options.basePattern = arg.slice("--base-pattern=".length);
    } else if (arg.startsWith("--check-delay=")) {
      options.checkDelay = Number(arg.slice("--check-delay=".length));
    } else if (arg.startsWith("--config=")) {
      options.configFile = arg.slice("--config=".length);
    } else if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
    } else if (arg.startsWith("--label=")) {
      options.label = arg.slice("--label=".length);
    } else if (arg.startsWith("--remote=")) {
      options.remote = arg.slice("--remote=".length);
    } else {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
  }

  if (!options.head) {
    throw new Error("--head is required");
  }
  if (Boolean(options.base) === Boolean(options.basePattern)) {
    throw new Error("Specify exactly one of --base or --base-pattern");
  }
  if (!Number.isInteger(options.checkDelay) || options.checkDelay < 0) {
    throw new Error("--check-delay must be a non-negative integer");
  }
  if (options.openPullRequests && !options.push) {
    throw new Error("--no-push must be combined with --no-pr");
  }
  if (options.autoMerge && !options.openPullRequests) {
    throw new Error("--auto-merge cannot be combined with --no-pr");
  }

  return options;
}

export function loadPreservedPaths(configFile = DEFAULT_CONFIG) {
  if (!existsSync(configFile)) {
    throw new Error(`${configFile} not found`);
  }

  const config = JSON.parse(readFileSync(configFile, "utf8"));
  const paths = config.release?.removeOnReleaseBranch;
  if (!Array.isArray(paths)) {
    throw new Error(`${configFile}: release.removeOnReleaseBranch must be an array`);
  }
  if (paths.some((path) => typeof path !== "string" || path.length === 0)) {
    throw new Error(`${configFile}: release.removeOnReleaseBranch must contain non-empty paths`);
  }
  return paths;
}

export function listMatchingBranches(remote, pattern) {
  const regex = new RegExp(pattern);
  return git([
    "for-each-ref",
    "--format=%(refname:strip=3)",
    `refs/remotes/${remote}`
  ])
    .split("\n")
    .filter(Boolean)
    .filter((branch) => regex.test(branch))
    .sort();
}

export function synchronizeBranches(options) {
  requireCleanWorktree();
  const preservedPaths = loadPreservedPaths(options.configFile);

  git(["fetch", "--prune", options.remote], { stdio: "inherit" });
  const bases = options.base
    ? [options.base]
    : listMatchingBranches(options.remote, options.basePattern);

  if (bases.length === 0) {
    throw new Error(`No remote branches match ${options.basePattern}`);
  }

  for (const base of bases) {
    synchronizeBranch({ ...options, base, preservedPaths });
  }
}

export function synchronizeBranch(options) {
  const { base, head, preservedPaths, remote } = options;
  const baseRef = `${remote}/${base}`;
  const headRef = `${remote}/${head}`;
  const syncBranch = `${base}-sync-with-${head}`;
  const syncRef = `${remote}/${syncBranch}`;
  const previousSync = tryGit(["rev-parse", "--verify", syncRef]);

  requireRef(baseRef);
  requireRef(headRef);

  git(["switch", "--force-create", syncBranch, baseRef], { stdio: "inherit" });
  const mergeMessage = `Merge ${head} into ${syncBranch}`;
  try {
    git([
      "-c",
      "user.name=github-actions[bot]",
      "-c",
      "user.email=41898282+github-actions[bot]@users.noreply.github.com",
      "merge",
      "--no-ff",
      "-m",
      mergeMessage,
      headRef
    ], { stdio: "inherit" });
  } catch (error) {
    resolveDestinationConflicts(baseRef, preservedPaths, mergeMessage, error);
  }

  restoreDestinationPaths(baseRef, preservedPaths);
  if (hasStagedChanges()) {
    git([
      "-c",
      "user.name=github-actions[bot]",
      "-c",
      "user.email=41898282+github-actions[bot]@users.noreply.github.com",
      "commit",
      "-m",
      "Restore destination-owned paths"
    ], { stdio: "inherit" });
  }

  if (git(["rev-list", "--count", `${baseRef}..HEAD`]) === "0") {
    console.log(`${base} already contains all relevant changes from ${head}.`);
    return;
  }

  if (options.push) {
    const pushArgs = ["push", "--set-upstream"];
    if (previousSync) {
      pushArgs.push(`--force-with-lease=refs/heads/${syncBranch}:${previousSync}`);
    }
    pushArgs.push(remote, syncBranch);
    git(pushArgs, { stdio: "inherit" });
  }

  if (options.openPullRequests) {
    const pullRequest = findOrCreatePullRequest(options, syncBranch);
    if (options.autoMerge) {
      waitForChecksAndMerge(pullRequest.url, options.checkDelay);
    }
  }
}

export function restoreDestinationPaths(baseRef, paths) {
  for (const path of paths) {
    if (tryGit(["cat-file", "-e", `${baseRef}:${path}`]) !== null) {
      git(["restore", "--source", baseRef, "--staged", "--worktree", "--", path]);
    } else {
      git(["rm", "-r", "--ignore-unmatch", "--", path]);
    }
  }
}

function resolveDestinationConflicts(baseRef, preservedPaths, mergeMessage, mergeError) {
  const conflicts = git(["diff", "--name-only", "--diff-filter=U"])
    .split("\n")
    .filter(Boolean);
  const unexpected = conflicts.filter((path) => !preservedPaths.some(
    (preserved) => path === preserved || path.startsWith(`${preserved}/`)
  ));

  if (conflicts.length === 0 || unexpected.length > 0) {
    if (unexpected.length > 0) {
      console.error(`Synchronization has conflicts outside destination-owned paths:\n${unexpected.join("\n")}`);
    }
    throw mergeError;
  }

  restoreDestinationPaths(baseRef, conflicts);
  git([
    "-c",
    "user.name=github-actions[bot]",
    "-c",
    "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit",
    "-m",
    mergeMessage
  ], { stdio: "inherit" });
}

function findOrCreatePullRequest(options, syncBranch) {
  const existing = JSON.parse(gh([
    "pr",
    "list",
    "--base",
    options.base,
    "--head",
    syncBranch,
    "--state",
    "open",
    "--json",
    "number,url"
  ]) || "[]")[0];

  if (existing) {
    console.log(`PR #${existing.number} already wants to merge ${syncBranch} into ${options.base}`);
    return existing;
  }

  const url = gh([
    "pr",
    "create",
    "--base",
    options.base,
    "--head",
    syncBranch,
    "--label",
    options.label,
    "--title",
    `${options.base}: sync with ${options.head}`,
    "--body",
    `Merge relevant changes from \`${options.head}\` into \`${options.base}\`.`
  ]);
  console.log(`PR to sync ${options.base} with ${options.head}: ${url}`);
  return { url };
}

function waitForChecksAndMerge(url, delay) {
  if (delay > 0) {
    execFileSync("sleep", [String(delay)]);
  }
  try {
    gh(["pr", "checks", url, "--watch", "--required"], { stdio: "inherit" });
  } catch {
    console.log(`Required checks did not pass for ${url}; leaving the pull request open.`);
    return;
  }
  gh(["pr", "merge", url, "--merge", "--admin"], { stdio: "inherit" });
}

function requireCleanWorktree() {
  if (git(["status", "--porcelain"])) {
    throw new Error("Working tree must be clean before synchronizing branches");
  }
}

function requireRef(ref) {
  if (tryGit(["rev-parse", "--verify", ref]) === null) {
    throw new Error(`Git ref not found: ${ref}`);
  }
}

function hasStagedChanges() {
  try {
    git(["diff", "--cached", "--quiet"]);
    return false;
  } catch {
    return true;
  }
}

function git(args, options = {}) {
  return run("git", args, options);
}

function gh(args, options = {}) {
  return run("gh", args, options);
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"]
  });
  return typeof output === "string" ? output.trim() : "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  synchronizeBranches(parseSyncArgs(process.argv.slice(2)));
}
