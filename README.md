# OpenAPI Initiative Build Infrastructure

This repository contains the shared build, test, publication, and release
infrastructure used by OpenAPI Initiative specification repositories.

It is a Node.js package because a package gives us a reliable way to distribute
command-line tools and their JavaScript dependencies. It is not published to
the npm registry. Specification repositories install it directly from GitHub
with Yarn.

## What This Package Provides

The package installs these command line tools:

| Command | Purpose |
| ------- | ------- |
| `oai-spec-build` | Converts published `versions/*.md` files, or the active `src/*.md` file, into ReSpec-rendered HTML. |
| `oai-spec-format-markdown` | Formats Markdown files with the shared Markdown rules. |
| `oai-spec-validate-markdown` | Runs Markdown linting and link checks. |
| `oai-spec-publish-schemas` | Converts YAML schemas under `src/schemas/validation/` into dated JSON schema iterations for the spec site. |
| `oai-spec-test` | Runs Vitest and JSON Schema coverage with the shared test dependencies. |
| `oai-spec-start-release` | Starts the next `vX.Y-dev-start-X.Y.Z` release-preparation branch. |
| `oai-spec-adjust-release-branch` | Prepares a `vX.Y.Z-rel` branch for merge to `main`. |

It also exports small helper modules for Vitest and schema tests, so
specification repositories do not need to depend directly on Vitest, Hyperjump,
ReSpec, markdownlint, linkspector, or YAML tooling.

`oai-spec-build` treats ReSpec errors as build failures. ReSpec warnings remain
visible but do not stop a build; errors such as unresolved bibliographic
references stop the command before it publishes incomplete HTML.

## Repository Shape Expected By The Tools

The tools assume the same broad layout in every specification repository:

```text
.
├── EDITORS.md
├── package.json
├── spec.config.json
├── src/
│   ├── <spec-source>.md
│   └── schemas/validation/*.yaml
├── tests/schema/
└── versions/
    ├── X.Y.Z.md
    └── X.Y.Z-editors.md
```

Not every repository needs every path. For example, a specification without
schemas does not need schema tests or `oai-spec-publish-schemas`.
Repositories that keep maintainers in a different file, such as
`MAINTAINERS.md`, can configure that in `spec.config.json`.

## Adding This To A Specification Repository

1. Use Node.js 24 and Yarn 4.18. Add these package-manager fields and the GitHub
   dependency to `package.json`:

   ```json
   {
     "packageManager": "yarn@4.18.0",
     "engines": {
       "node": ">=24 <25"
     },
     "dependencies": {
       "@oai/build-infra": "git+https://github.com/OAI/build-infra.git#main"
     },
     "dependenciesMeta": {
       "puppeteer": {
         "built": true
       }
     }
   }
   ```

   `puppeteer` is a transitive dependency used by linkspector and ReSpec. Yarn
   disables third-party install scripts by default, so this entry explicitly
   allows the script that installs the browser used for link checking and
   specification rendering.

2. Add `.nvmrc` so version managers can select the expected Node.js release:

   ```text
   24
   ```

3. Add `.yarnrc.yml`:

   ```yaml
   nodeLinker: node-modules
   approvedGitRepositories:
     - https://github.com/OAI/build-infra.git
   ```

   The shared shell commands currently require a `node_modules` installation.
   Yarn 4 also requires GitHub dependencies to be explicitly approved.

4. Ignore generated dependency state:

   ```gitignore
   node_modules/
   .yarn/
   coverage/
   ```

5. Add package scripts that wrap the shared commands:

   ```json
   {
     "scripts": {
       "build": "oai-spec-build",
       "build-src": "yarn validate-markdown && oai-spec-build src",
       "format-markdown": "oai-spec-format-markdown",
       "validate-markdown": "oai-spec-validate-markdown",
       "start-release": "oai-spec-start-release",
       "adjust-release-branch": "oai-spec-adjust-release-branch"
     }
   }
   ```

   If the repository publishes schemas, make `build-src` also publish them:

   ```json
   {
     "scripts": {
       "build-src": "yarn validate-markdown && oai-spec-build src && oai-spec-publish-schemas src",
       "publish-schemas": "oai-spec-publish-schemas",
       "test": "oai-spec-test"
     }
   }
   ```

6. Create `spec.config.json`. At minimum:

   ```json
   {
     "slug": "myspec",
     "shortName": "MySpec",
     "specSrc": "myspec.md",
     "edDraftURI": "https://github.com/OAI/my-spec/",
     "schemas": ["schema.yaml"]
   }
   ```

7. Enable Corepack once, create the initial lockfile, and verify it:

   ```sh
   corepack enable
   yarn install
   yarn install --immutable
   ```

   Commit `yarn.lock`. After the initial lockfile exists, use
   `yarn install --immutable` for routine local installs and in GitHub Actions.
   It fails instead of silently changing an out-of-date lockfile.

The lockfile is important. `package.json` intentionally requests the `main`
branch of `OAI/build-infra`, while `yarn.lock` records the exact Git commit
resolved from that branch. This makes immutable installs repeatable without
requiring maintainers to copy a commit hash into `package.json`.

## Keeping Dependencies Up To Date

Most JavaScript dependency updates happen in this repository, not in each
specification repository. Direct toolchain dependencies are pinned exactly here
so consumers receive the versions tested by build-infra.

Dependabot calls the JavaScript package ecosystem `npm`, even when the project
uses Yarn, and opens pull requests that update `package.json` and `yarn.lock`.
After an update is reviewed, merged, and pushed to `OAI/build-infra`, update each
consumer repository with:

```sh
yarn up -R @oai/build-infra
yarn install --immutable
yarn test
yarn validate-markdown
yarn build
```

For repositories that only have source builds, also run:

```sh
yarn build-src
```

Commit the resulting `yarn.lock` change. `yarn up -R` re-resolves the existing
`#main` request without changing `package.json`; the lockfile should move to the
new build-infra commit. The self-contained Git-consumer test exercises this same
update procedure.

### Updating Node.js Or Yarn

The expected Node.js release appears in `.nvmrc`, `package.json`, and GitHub
Actions. The Yarn release appears in `packageManager`. Update build-infra first,
run an immutable install and the complete test suite, then apply the same runtime
versions to consumer repositories. Keeping these declarations aligned prevents
local development, Git packaging, and CI from selecting different tools.

## `spec.config.json`

The shared tools read `spec.config.json` from the repository root.

Common fields:

| Field | Meaning |
| ----- | ------- |
| `slug` | Path segment on `spec.openapis.org`, such as `oas` or `lifecycle`. |
| `shortName` | Short display name used in generated ReSpec metadata. |
| `titleName` | Longer display name, if different from `shortName`. |
| `specSrc` | Active Markdown filename under `src/`, such as `oas.md`. |
| `schemas` | YAML schema filenames under `src/schemas/validation/`, in dependency order. |
| `edDraftURI` | GitHub URL for the repository. |
| `participateLinks` | Links shown in generated HTML. |
| `maintainersPath` | Maintainer/editor Markdown file to use when both source and published builds share one file. |
| `sourceMaintainersPath` | Maintainer/editor Markdown file for `oai-spec-build src`; defaults to `maintainersPath`, then `EDITORS.md`. |
| `publishedMaintainersPath` | Maintainer/editor Markdown file for published `versions/*.md` builds; defaults to `versions/X.Y.Z-editors.md`. |

Published builds discover `versions/X.Y.Z.md` files for any numeric major
version, including `1.x` specifications. For each minor version, the newest
published patch also gets a `vX.Y.html` alias.

Release-related fields live under `release`:

```json
{
  "release": {
    "sourcePath": "src/spec.md",
    "releaseHistoryNote": "$releaseType of the Example Specification $version",
    "removeOnReleaseBranch": [
      "src",
      "tests/schema/pass",
      "tests/schema/fail",
      "tests/schema/schema.test.mjs"
    ],
    "schemaVersionRewrite": {
      "enabled": true,
      "paths": [
        "src/schemas/validation/*.yaml",
        "tests/schema/schema.test.mjs",
        "tests/schema/pass/*.yaml",
        "tests/schema/fail/*.yaml"
      ]
    }
  }
}
```

`$version`, `$minor`, and `$releaseType` are replaced by release commands.

## Release Process Summary

The detailed release policy belongs in each specification repository, but the
shared commands assume this branch model:

| Branch | Purpose |
| ------ | ------- |
| `main` | Published Markdown files under `versions/`; no active `src/` tree. |
| `vX.Y-dev` | Active development branch for the next X.Y.Z release. |
| `vX.Y.Z-rel` | Temporary release branch merged into `main`. |

Typical release flow:

1. Prepare and review the active source file on `vX.Y-dev`.
2. Create a `vX.Y.Z-rel` branch from `vX.Y-dev`.
3. Run `yarn adjust-release-branch`.
4. Review the staged release changes with `git diff --cached`. The command
   stages the complete release changeset, but does not commit it.
5. Make any necessary manual adjustments. After editing, run `git add --all`
   and review `git diff --cached` again so the staged versions include those
   adjustments.
6. Commit the release changes and open a pull request from `vX.Y.Z-rel` to
   `main`.
7. After the release lands and syncs back to `vX.Y-dev`, run
   `yarn start-release` on `vX.Y-dev` to prepare the next patch version.

For a new minor release branch, create the new `vX.Y-dev` branch first and then
run `yarn start-release` there. If schema version rewriting is enabled, the
command updates configured schema and test files from the previous minor version
to the new minor version.

## Schema Test Setup

Repositories with one standard JSON Schema 2020-12 schema can keep their test
files very small. A typical `vitest.config.mjs` is:

```js
export { default } from "@oai/build-infra/vitest-config";
```

A typical `tests/schema/setup.mjs` is:

```js
import { createTestConfig } from "@oai/build-infra/schema/test-config";

export default createTestConfig();
```

The schema test itself can import Vitest and the coverage-aware schema matcher
from build-infra. Use the `$id` URI from the YAML schema as `schemaUri`.

```js
import { readdirSync, readFileSync } from "node:fs";
import YAML from "yaml";
import { registerSchema, toMatchJsonSchema } from "@oai/build-infra/schema/vitest";
import { describe, expect, test } from "@oai/build-infra/test";

expect.extend({ toMatchJsonSchema });

const schemaUri = "https://spec.openapis.org/example/1.0/schema/WORK-IN-PROGRESS";
await registerSchema("./src/schemas/validation/schema.yaml");

describe("schema", () => {
  for (const entry of readdirSync("tests/schema/pass", { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".yaml")) continue;

    test(`pass/${entry.name}`, async () => {
      const document = YAML.parse(readFileSync(`tests/schema/pass/${entry.name}`, "utf8"));
      await expect(document).toMatchJsonSchema(schemaUri);
    });
  }

  for (const entry of readdirSync("tests/schema/fail", { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".yaml")) continue;

    test(`fail/${entry.name}`, async () => {
      const document = YAML.parse(readFileSync(`tests/schema/fail/${entry.name}`, "utf8"));
      await expect(document).not.toMatchJsonSchema(schemaUri);
    });
  }
});
```

OAS-style repositories that need custom vocabulary registration can pass
`vocabularyKeywords` to `createTestConfig`; see the comments in
`src/schema/test-config.mjs`.

## Local Development

When working on this package itself:

```sh
corepack enable
yarn install --immutable
yarn test
```

`yarn test` runs self-contained tests. Some tests create temporary fixture
specification repositories and local Git remotes so release-command behavior can
be checked without a separate consumer repository.

## Testing Strategy

The tests are meant to document normal operation as much as they prevent
regressions. Useful examples:

| Test file | What it documents |
| --------- | ----------------- |
| `tests/consumer/git-dependency.test.mjs` | The intended released-package integration path: Yarn selects compatible semantic-version Git tags, ignores untagged and incompatible releases, records an immutable Git object, refreshes it with `yarn up -R`, performs an immutable reinstall, and imports public helpers. |
| `tests/consumer/installed-package.test.mjs` | How all public command-line tools behave from an installed `node_modules` package layout. |
| `tests/qualification/qualify-consumer.test.mjs` | How candidate qualification selects an exact build-infra commit and chooses validation, test, build, and release checks from a consumer repository's contents and scripts. |
| `tests/shell/bin-resolution.test.mjs` | How Markdown validation and formatting choose configs, when linkspector runs, and how command wrappers resolve hoisted binaries. |
| `tests/release/release-commands.test.mjs` | The expected branch model for release commands, including clean-worktree and remote-branch guardrails. |
| `tests/schema/schema-publish.test.mjs` | Schema publication behavior for source previews, versioned development branches, dated schema files, and Jekyll lander markdown. |
| `tests/package/package-manager.test.mjs` | The Yarn version, `node_modules` linker, exact direct dependencies, and Puppeteer install-script policy required by consumers. |
| `tests/package/exports.test.mjs` | Public helper modules that consumer test suites can import. |

When adding behavior to build-infra, prefer adding or extending one of these
consumer-shaped fixture tests. A test that runs without any checked-out
specification repository is much easier for future maintainers to trust and run
locally.

### Qualifying A Candidate In Real Consumers

Self-contained tests cannot cover every combination of content and branch
history in the specification repositories. Before treating a build-infra commit
as release-worthy, run the **Qualify build-infra candidate** workflow from the
GitHub Actions page.

The optional workflow input is a full commit SHA from `OAI/build-infra`. If it
is empty, the workflow tests the commit selected when the workflow is started.
The commit must already be reachable from the `OAI/build-infra` repository so
Yarn can install it by its exact SHA.

The workflow uses disposable checkouts of:

* `main`, `dev`, `v3.1-dev`, `v3.2-dev`, and `v3.3-dev` in
  `OAI/OpenAPI-Specification`;
* `main` in `OAI/sig-lifecycle`; and
* `main` and `v1.0-dev` in `OAI/sig-security`.

For each checkout it installs the exact candidate, immediately verifies that
the resulting lockfile can be installed immutably, and then runs the validation,
test, published build, and source build commands that the repository supports.
The OpenAPI version-development branches also exercise release adjustment on a
temporary `vX.Y.999-rel` branch and verify that the new specification and editor
snapshot are staged. The SIG repositories do not yet have a published
`versions/` tree, so their first-release behavior is not part of this check.

This workflow is manual because it performs several full consumer builds and
uses networked repository checkouts. It complements `yarn test`; it does not
replace the fast tests required on every build-infra pull request.

The same runner can be used locally against a disposable consumer clone:

```sh
yarn qualify-consumer \
  --consumer=/tmp/OpenAPI-Specification \
  --candidate=<full-build-infra-commit-sha> \
  --base=v3.3-dev \
  --release-version=3.3.999
```

The runner rewrites `package.json` and `yarn.lock`. When a release version is
provided, it also commits that temporary dependency update, creates a release
branch, and stages release output. Never point it at a working checkout that
contains work you need to keep.

## Releasing Build-Infra

Build-infra is installed directly from GitHub and is never published to npm.
`package.json` therefore sets `private` to `true`, and an immutable `vX.Y.Z` Git
tag identifies each released version.

The `main` branch contains candidates. Merging a pull request to `main` does not
release it. A commit becomes release-worthy only when the manually triggered
**Release build-infra** workflow successfully creates its version tag.

Use semantic versions to communicate compatibility:

* Patch releases contain fixes and dependency updates that do not change the
  consumer-facing command or configuration contract.
* Minor releases add backward-compatible commands or configuration options.
* Major releases change existing commands, configuration, or runtime
  requirements incompatibly.

Prepare and publish a release as follows:

1. Change `version` in `package.json` to the intended stable `X.Y.Z` version.
2. Run `yarn install` because the package manifest changed, followed by
   `yarn install --immutable` and `yarn test`.
3. Commit the version change through the normal pull-request process.
4. After it merges, open GitHub Actions, choose **Release build-infra**, select
   `main`, and run the workflow.
5. Wait for the package tests and all downstream consumer qualification jobs.
6. Approve the `build-infra-release` environment deployment when GitHub asks.
7. Verify that the workflow created the annotated `vX.Y.Z` tag on the exact
   commit it tested.

The workflow refuses prerelease version strings, npm-publishable package
metadata, non-`main` runs, mismatched commits, and reused tags. It tests and tags
the commit selected when the workflow starts, even if `main` advances while its
downstream jobs are running.

Never move, replace, or reuse a release tag. If a released version is faulty,
revert or fix the problem on `main` and publish a new patch version.

### One-Time GitHub Configuration

A repository administrator must create an environment named
`build-infra-release` under **Settings > Environments** and assign its required
reviewers. Without that protection, the final workflow job will not pause for
human approval.

Also create a tag ruleset for `v*` under **Settings > Rules > Rulesets**. Prevent
tag updates and deletions, while allowing the release workflow to create new
tags. The exact bypass settings depend on the repository's organization policy,
so verify the first release with an administrator present.

To test changes in a specification repository before pushing build-infra, use a
temporary local dependency in that repository:

```json
{
  "dependencies": {
    "@oai/build-infra": "file:../build-infra"
  }
}
```

Run `yarn install` after making the temporary change. Do not commit that local
`file:` dependency or its lockfile result; it is only for local experiments.
