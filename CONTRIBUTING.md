# Contributing To Build Infrastructure

The goal is to keep the specification repositories uncluttered: each spec repo
should call clear npm scripts, while this package owns the tool versions and
reusable logic.

## Mental Model

There are four layers:

1. Specification repositories contain Markdown, schemas, tests, workflows, and
   `spec.config.json`.
2. Their `package.json` scripts call commands installed by `@oai/build-infra`.
3. This repository implements those commands and owns the JavaScript
   dependencies they need.
4. GitHub Actions in each specification repository run the same npm scripts that
   maintainers run locally.

If something is reusable across specification repositories, put it here. If it is
specific to one repository's governance, labels, reviewers, or branch policy,
leave it in that repository.

## Command Overview

Build and validation:

* `oai-spec-build` renders Markdown to HTML using Markdown-it and ReSpec.
* `oai-spec-format-markdown` applies shared Markdown formatting.
* `oai-spec-validate-markdown` runs markdownlint and linkspector.
* `oai-spec-publish-schemas` publishes dated JSON schema iterations.

Tests:

* `oai-spec-test` runs `c8` and `vitest`.
* `@oai/build-infra/test` re-exports Vitest helpers.
* `@oai/build-infra/schema/test-config` registers YAML schema loading and any
  configured custom vocabulary keywords.
* `@oai/build-infra/schema/vitest` re-exports schema coverage helpers.

Release lifecycle:

* `oai-spec-start-release` starts the next development PR branch.
* `oai-spec-adjust-release-branch` prepares a release branch for merge to
  `main`.

## Before Changing Code

Read the consuming repository's `spec.config.json` and `package.json` first.
Most behavior is configured there.

Be especially careful with release commands. They create branches, commit files,
delete configured paths, and may push branches. Test release-command changes in a
scratch repository before asking maintainers to trust them.

## Testing

Run the package tests:

```sh
npm test
```

These tests include self-contained fixture repositories. They exercise the
public commands against temporary consumer-shaped Git repositories, so they can
run locally and in GitHub CI without another checkout.

For changes that affect behavior not covered by those fixtures, also test in at
least one specification repository with a temporary local dependency:

```json
{
  "dependencies": {
    "@oai/build-infra": "file:../build-infra"
  }
}
```

Then run the relevant consumer scripts:

```sh
npm ci
npm test
npm run validate-markdown
npm run build
npm run build-src
```

Not every repository has all of those scripts.

Before committing consumer changes, change the dependency back to the GitHub
dependency and refresh the lockfile after the build-infra commit is available on
GitHub.

## Dependency Maintenance

This repository owns most npm dependencies for the specification repositories.
Dependabot is configured here for npm updates.

When Dependabot opens a pull request:

1. Read the release notes for major updates and security updates.
2. Run `npm ci` and `npm test`.
3. If the update touches build, markdown, schema, or test behavior, test a
   consumer repository with the local `file:../build-infra` dependency.
4. Merge the build-infra update.
5. In each consumer repository that should pick up the change, run:

   ```sh
   npm update @oai/build-infra
   ```

6. Commit the consumer repository's `package-lock.json` update.

The consumer `package.json` should keep requesting
`git+https://github.com/OAI/build-infra.git#main`. The consumer
`package-lock.json` records that request at the root of the lockfile, and
records the exact resolved Git commit under
`packages["node_modules/@oai/build-infra"].resolved`. That resolved commit is
intentional: it prevents CI from silently changing behavior because
`OAI/build-infra` moved forward.

### Lockfile Maintenance Warning

Use `npm ci` as the normal install command in this repository and in consumer
specification repositories, including on macOS. Do not use `npm install` merely
to get a working local `node_modules` tree.

This matters because npm has sometimes produced an incomplete `package-lock.json`
for platform-specific optional dependencies on macOS. Known failure modes
include omitting optional peer-resolution entries for packages such as
`@emnapi/core` and `@emnapi/runtime`, or leaving stale transitive entries from a
previous dependency tree. The lockfile can appear to work locally but then fail
in GitHub Actions, where `npm ci` checks the lockfile strictly on Linux.

Only use `npm install`, `npm update`, or similar commands when you are
intentionally creating or changing a lockfile. After any dependency change in
this repository or in a consumer repository:

1. Run `npm ci`.
2. Run `npm test`.
3. Run any repository-specific build or validation scripts.
4. Check that GitHub Actions also passes `npm ci`.
5. If `npm ci` says packages are missing from the lockfile, fix the lockfile and
   re-run `npm ci`. Do not paper over the problem by switching CI to
   `npm install`.

When setting up a new specification repository whose only npm dependency is
`@oai/build-infra`, the consumer `package-lock.json` should contain the
dependency tree needed by the resolved build-infra commit. If `npm ci` reports
missing or invalid transitive packages after adding build-infra, compare the
consumer lockfile with this repository's verified `package-lock.json`, or run
`oai-spec-sync-lockfile` in the consumer repository, and make sure the consumer
lockfile includes the same transitive package entries. This is especially
important for optional dependencies, because those are where platform-specific
lockfile gaps usually appear.

The sync helper uses the packaged snapshot at
`src/lockfile/build-infra-package-lock.json` when build-infra is installed from
GitHub. npm does not include the root `package-lock.json` in installed Git
packages. Whenever `package-lock.json` changes in this repository, refresh that
snapshot too:

```sh
npm run sync-lockfile-snapshot
npm run check-lockfile-snapshot
```

`npm test` also runs this check before the Vitest suite.

## Release Command Maintenance

The release commands are intentionally conservative.

`oai-spec-adjust-release-branch`:

* must run on a branch named `vX.Y.Z-rel`;
* requires a clean working tree;
* copies the active source Markdown to `versions/X.Y.Z.md`;
* replaces `| TBD |` with the current date;
* copies `EDITORS.md` to `versions/X.Y.Z-editors.md`, unless disabled;
* removes paths listed in `release.removeOnReleaseBranch`.

`oai-spec-start-release`:

* must run on a branch named `vX.Y-dev`;
* requires a clean working tree;
* finds the latest published version under `versions/` on the configured main
  branch;
* creates `vX.Y-dev-start-X.Y.Z`;
* resets the active source Markdown history from the previous published version;
* updates the version heading and history table;
* optionally rewrites schema/test files for a new minor version;
* pushes the branch unless `--no-push` is used.

Use `--no-push` in scratch tests.

## Common Failure Modes

* `npm ci` fails in a consumer repository: the package lock's resolved
  build-infra commit may not be reachable from GitHub yet, `package.json` and
  `package-lock.json` may disagree about the requested dependency, or the
  consumer lockfile may be missing transitive entries from build-infra's
  dependency tree. Verify with `npm ci` before opening the pull request.
* Release command says the working tree is dirty: commit or stash local changes
  first. These commands intentionally refuse to mix release edits with unrelated
  work.
* `oai-spec-start-release` cannot find published versions: check the configured
  remote, main branch, and `versions/` directory.
* Generated HTML looks wrong: check `spec.config.json` first, especially `slug`,
  `shortName`, `titleName`, `specSrc`, and metadata links.

## What Belongs Here

Good candidates for this repository:

* shared command-line tools;
* shared JavaScript dependency versions;
* Markdown, link, schema, and ReSpec behavior;
* release lifecycle mechanics used by multiple specification repositories;
* templates for new specification repositories.

Keep these in individual specification repositories:

* contributor policy;
* branch sync policy;
* CODEOWNERS;
* issue templates;
* labels, reviewers, and pull request wording;
* one-off scripts for that repository's issue management or governance.
