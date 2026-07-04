# OpenAPI Initiative Specification Build Infrastructure

This repository contains shared infrastructure for building and testing
publications of the OpenAPI Initiative.

It also contains shared release-lifecycle commands for specification
repositories that publish versioned markdown from `vX.Y-dev` and
`vX.Y.Z-rel` branches.

## Release Commands

The release commands read `spec.config.json` from the repository root.

* `oai-spec-start-release` starts the next release branch from a `vX.Y-dev`
  branch, using the latest published file under `versions/`.
* `oai-spec-adjust-release-branch` prepares a `vX.Y.Z-rel` branch by copying
  the active source markdown to `versions/X.Y.Z.md`, snapshotting editors, and
  removing configured development-only files.

Relevant `spec.config.json` fields:

```json
{
  "specSrc": "spec.md",
  "release": {
    "sourcePath": "src/spec.md",
    "releaseHistoryNote": "$releaseType of the Example Specification $version",
    "removeOnReleaseBranch": ["src"],
    "schemaVersionRewrite": {
      "enabled": true,
      "paths": ["src/schemas/validation/*.yaml"]
    }
  }
}
```
