import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../..");
const testDirs = [];

afterEach(() => {
  while (testDirs.length > 0) {
    rmSync(testDirs.pop(), { recursive: true, force: true });
  }
});

describe("Yarn Git dependency installation", () => {
  test("installs, updates, and immutably reinstalls the Git dependency", () => {
    const root = mkdtempSync(join(tmpdir(), "oai-yarn-git-consumer-"));
    testDirs.push(root);

    const provider = createProviderRepository(root);
    const firstCommit = git(provider, ["rev-parse", "HEAD"]);
    const consumer = createConsumer(root);
    const gitConfig = configureLocalGitRemote(root, provider);
    const env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: gitConfig,
      GIT_CONFIG_NOSYSTEM: "1"
    };

    yarn(consumer, ["install"], env);

    const firstLockfile = readFileSync(join(consumer, "yarn.lock"), "utf8");
    expect(firstLockfile).toContain(`build-infra.git#commit=${firstCommit}`);
    expect(existsSync(join(consumer, "node_modules/@oai/build-infra/package-lock.json"))).toBe(false);
    expect(existsSync(join(consumer, "node_modules/.bin/oai-spec-build"))).toBe(true);
    writeFileSync(join(consumer, "spec.config.json"), '{"specSrc":"spec.md"}\n');
    writeFileSync(join(consumer, "README.md"), "# Consumer fixture\n");
    yarn(consumer, ["format-markdown"], env);

    const packageJsonBeforeUpdate = readFileSync(join(consumer, "package.json"), "utf8");
    writeFileSync(join(provider, "UPDATE-MARKER"), "new provider commit\n");
    git(provider, ["add", "UPDATE-MARKER"]);
    git(provider, ["commit", "-m", "update fixture package"]);
    const secondCommit = git(provider, ["rev-parse", "HEAD"]);

    yarn(consumer, ["up", "-R", "@oai/build-infra"], env);

    const secondLockfile = readFileSync(join(consumer, "yarn.lock"), "utf8");
    expect(secondLockfile).toContain(`build-infra.git#commit=${secondCommit}`);
    expect(secondLockfile).not.toContain(`build-infra.git#commit=${firstCommit}`);
    expect(readFileSync(join(consumer, "package.json"), "utf8")).toBe(packageJsonBeforeUpdate);

    rmSync(join(consumer, "node_modules"), { recursive: true, force: true });
    rmSync(join(consumer, ".yarn"), { recursive: true, force: true });
    yarn(consumer, ["install", "--immutable"], env);

    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        [
          'const { createRequire } = await import("node:module");',
          "const consumerRequire = createRequire(import.meta.url);",
          'const buildInfraRequire = createRequire(consumerRequire.resolve("@oai/build-infra/package.json"));',
          'const coverageRequire = createRequire(buildInfraRequire.resolve("@hyperjump/json-schema-coverage/vitest"));',
          'if (buildInfraRequire.resolve("@hyperjump/browser") !== coverageRequire.resolve("@hyperjump/browser")) throw new Error("duplicate Hyperjump Browser runtimes");',
          'if (buildInfraRequire.resolve("@hyperjump/json-schema") !== coverageRequire.resolve("@hyperjump/json-schema")) throw new Error("duplicate Hyperjump JSON Schema runtimes");',
          'const testHelpers = await import("@oai/build-infra/test");',
          'const schemaHelpers = await import("@oai/build-infra/schema/vitest");',
          'console.log(typeof testHelpers.test, typeof schemaHelpers.registerSchema);'
        ].join(" ")
      ],
      { cwd: consumer, encoding: "utf8" }
    );

    expect(output.trim()).toBe("function function");
  }, 30_000);
});

function createProviderRepository(root) {
  const provider = join(root, "provider");
  mkdirSync(provider);

  for (const path of ["bin", "configs", "src", "templates"]) {
    cpSync(join(packageRoot, path), join(provider, path), { recursive: true });
  }
  for (const path of ["package.json", "yarn.lock", ".yarnrc.yml"]) {
    cpSync(join(packageRoot, path), join(provider, path));
  }

  git(provider, ["init", "--initial-branch=main"]);
  git(provider, ["config", "user.name", "Fixture Maintainer"]);
  git(provider, ["config", "user.email", "fixture@example.com"]);
  git(provider, ["add", "."]);
  git(provider, ["commit", "-m", "fixture package"]);

  return provider;
}

function createConsumer(root) {
  const consumer = join(root, "consumer");
  mkdirSync(consumer);

  writeFileSync(join(consumer, "package.json"), JSON.stringify({
    name: "build-infra-consumer-fixture",
    private: true,
    packageManager: "yarn@4.18.0",
    scripts: {
      "format-markdown": "oai-spec-format-markdown"
    },
    dependencies: {
      "@oai/build-infra": "git+https://build-infra.test/OAI/build-infra.git#main"
    },
    dependenciesMeta: {
      puppeteer: {
        built: true
      }
    }
  }, null, 2) + "\n");
  writeFileSync(
    join(consumer, ".yarnrc.yml"),
    [
      "nodeLinker: node-modules",
      "approvedGitRepositories:",
      "  - https://build-infra.test/OAI/build-infra.git",
      ""
    ].join("\n")
  );

  return consumer;
}

function configureLocalGitRemote(root, provider) {
  const gitConfig = join(root, "gitconfig");
  const providerUrl = pathToFileURL(provider).href;

  execFileSync("git", [
    "config",
    "--file",
    gitConfig,
    `url.${providerUrl}.insteadOf`,
    "https://build-infra.test/OAI/build-infra.git"
  ]);

  return gitConfig;
}

function yarn(cwd, args, env) {
  try {
    return execFileSync("corepack", ["yarn", ...args], {
      cwd,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    throw new Error(`${error.stdout || ""}${error.stderr || ""}` || error.message);
  }
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trimEnd();
}
