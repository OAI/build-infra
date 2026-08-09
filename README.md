# OpenAPI Initiative Build Infrastructure

This repository contains the shared build, test, publication, and release
infrastructure used by OpenAPI Initiative specification repositories.

It is an npm package because npm gives us a reliable way to distribute command
line tools and their JavaScript dependencies. It is not published to npm.
Specification repositories install it directly from GitHub.

## What This Package Provides

The package installs these command line tools:

| Command | Purpose |
| ------- | ------- |
| `oai-spec-build` | Converts published `versions/*.md` files, or the active `src/*.md` file, into ReSpec-rendered HTML. |
| `oai-spec-format-markdown` | Formats Markdown files with the shared Markdown rules. |
| `oai-spec-validate-markdown` | Runs Markdown linting and link checks. |
| `oai-spec-publish-schemas` | Converts YAML schemas under `src/schemas/validation/` into dated JSON schema iterations for the spec site. |
| `oai-spec-sync-lockfile` | Repairs a consumer repository lockfile by syncing build-infra's verified transitive dependency tree. |
| `oai-spec-test` | Runs Vitest and JSON Schema coverage with the shared test dependencies. |
| `oai-spec-start-release` | Starts the next `vX.Y-dev-start-X.Y.Z` release-preparation branch. |
| `oai-spec-adjust-release-branch` | Prepares a `vX.Y.Z-rel` branch for merge to `main`. |

It also exports small helper modules for Vitest and schema tests, so
specification repositories do not need to depend directly on Vitest, Hyperjump,
ReSpec, markdownlint, linkspector, or YAML tooling.

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

1. Add this package as a GitHub dependency:

   ```json
   {
     "dependencies": {
       "@oai/build-infra": "git+https://github.com/OAI/build-infra.git#main"
     }
   }
   ```

2. Add npm scripts that wrap the shared commands:

   ```json
   {
     "scripts": {
       "build": "oai-spec-build",
       "build-src": "npm run validate-markdown && oai-spec-build src",
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
       "build-src": "npm run validate-markdown && oai-spec-build src && oai-spec-publish-schemas src",
       "publish-schemas": "oai-spec-publish-schemas",
       "test": "oai-spec-test"
     }
   }
   ```

3. Create `spec.config.json`. At minimum:

   ```json
   {
     "slug": "myspec",
     "shortName": "MySpec",
     "specSrc": "myspec.md",
     "edDraftURI": "https://github.com/OAI/my-spec/",
     "schemas": ["schema.yaml"]
   }
   ```

4. Create or refresh the lockfile, then verify it with a clean install:

   ```sh
   npm install
   npm ci
   ```

   `npm install` is used here only to create or update `package-lock.json`.
   `npm ci` is the check that the lockfile is complete enough for GitHub
   Actions. Do not open the pull request until `npm ci` succeeds locally.

The lockfile is important. `package.json` intentionally tracks the `main` branch
of `OAI/build-infra`. `package-lock.json` records that requested dependency at
the root of the lockfile, and also records the exact commit npm resolved under
`packages["node_modules/@oai/build-infra"].resolved`. This makes CI repeatable
while still letting maintainers update to the current `main` branch with
`npm update @oai/build-infra`.

## Keeping Dependencies Up To Date

Most JavaScript dependency updates happen in this repository, not in each
specification repository.

Dependabot opens pull requests here for npm dependency updates. After those
changes are reviewed, merged, and pushed to `OAI/build-infra`, update each
specification repository that should use the new shared infrastructure:

```sh
npm update @oai/build-infra
npm test
npm run validate-markdown
npm run build
```

For repositories that only have source builds, also run:

```sh
npm run build-src
```

Commit the resulting `package-lock.json` change in the specification repository.
That change should update the resolved `@oai/build-infra` commit while leaving
the requested dependency as `git+https://github.com/OAI/build-infra.git#main`.
Before opening the pull request, run `npm ci` in the specification repository.
If it reports missing or invalid transitive packages, the lockfile is incomplete;
fix the lockfile and re-run `npm ci` rather than changing CI to use
`npm install`.

If a consumer repository's only npm dependency is `@oai/build-infra`, the
maintainer can usually repair an incomplete lockfile with:

```sh
oai-spec-sync-lockfile
npm ci
```

The command keeps the consumer repository's root package and resolved
`@oai/build-infra` commit, then syncs the transitive dependency entries from the
installed build-infra package lockfile snapshot. npm does not include a package's
root `package-lock.json` when it installs a Git dependency, so build-infra keeps
a packaged copy at `src/lockfile/build-infra-package-lock.json`. The test suite
checks that this snapshot matches the repository's root `package-lock.json`.

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
3. Run `npm run adjust-release-branch`.
4. Open a pull request from `vX.Y.Z-rel` to `main`.
5. After the release lands and syncs back to `vX.Y-dev`, run
   `npm run start-release` on `vX.Y-dev` to prepare the next patch version.

For a new minor release branch, create the new `vX.Y-dev` branch first and then
run `npm run start-release` there. If schema version rewriting is enabled, the
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
npm ci
npm test
```

When `package-lock.json` changes, refresh the packaged lockfile snapshot before
committing:

```sh
npm run sync-lockfile-snapshot
```

`npm test` runs self-contained tests. Some tests create temporary fixture
specification repositories and local Git remotes so release-command behavior can
be checked without a separate consumer repository.

## Testing Strategy

The tests are meant to document normal operation as much as they prevent
regressions. Useful examples:

| Test file | What it documents |
| --------- | ----------------- |
| `tests/consumer/installed-package.test.mjs` | How the public command line tools behave when build-infra is installed in a consumer repository and npm hoists dependencies to the consumer's top-level `node_modules`. |
| `tests/shell/bin-resolution.test.mjs` | How Markdown validation and formatting choose configs, when linkspector runs, and how command wrappers resolve hoisted binaries. |
| `tests/release/release-commands.test.mjs` | The expected branch model for release commands, including clean-worktree and remote-branch guardrails. |
| `tests/schema/schema-publish.test.mjs` | Schema publication behavior for source previews, versioned development branches, dated schema files, and Jekyll lander markdown. |
| `tests/package/package-lock.test.mjs` | Lockfile invariants, including keeping the packaged lockfile snapshot in sync with the root `package-lock.json`. |
| `tests/lockfile/sync-consumer-lockfile.test.mjs` | How `oai-spec-sync-lockfile` repairs a consumer lockfile while preserving the resolved build-infra commit. |
| `tests/package/exports.test.mjs` | Public helper modules that consumer test suites can import. |

When adding behavior to build-infra, prefer adding or extending one of these
consumer-shaped fixture tests. A test that runs without any checked-out
specification repository is much easier for future maintainers to trust and run
locally.

To test changes in a specification repository before pushing build-infra, use a
temporary local dependency in that repository:

```json
{
  "dependencies": {
    "@oai/build-infra": "file:../build-infra"
  }
}
```

Do not commit that local `file:` dependency. It is only for local experiments.
