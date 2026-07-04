#!/usr/bin/env bash
set -euo pipefail

# Author: @MikeRalphson

# run this script from the root of the repo
# It is designed to be run by a GitHub workflow

# Usage: build.sh [version | "latest" | "src"]
# When run with no arguments, it builds artifacts for all published specification versions.
# It may also be run with a specific version argument, such as "3.1.1" or "latest"
# Finally, it may be run with "src" to build the work-in-progress spec
#
# Optional environment variables:
#   SPEC_CONFIG path to the spec config file, default: spec.config.json
#   SPEC_SLUG   short identifier used in deploy paths, e.g. "oas", "overlay", "lifecycle"
#   SPEC_SRC    filename of the WIP spec under src/, default: spec.md
#
# It contains bashisms

CONFIG_FILE="${SPEC_CONFIG:-spec.config.json}"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Error: $CONFIG_FILE not found"
  exit 1
fi

SPEC_SLUG="${SPEC_SLUG:-$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.slug || 'spec')")}"
SPEC_SRC="${SPEC_SRC:-$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.specSrc || 'spec.md')")}"

# resolve md2html.js relative to this script regardless of CWD
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$PACKAGE_DIR/src/shell/bin-utils.sh"
RESPEC_BIN="$(resolve_node_bin respec "$PACKAGE_DIR")"

COMMAND="${1:-}"

if [ "$COMMAND" = "src" ]; then
  deploydir="deploy-preview"
else
  deploydir="deploy/$SPEC_SLUG"
fi

mkdir -p $deploydir/js
mkdir -p $deploydir/temp
# Find respec via Node.js module resolution so it works in both standalone
# and npm workspace setups (where it may be hoisted above the CWD).
RESPEC_DIR="$PACKAGE_DIR/node_modules/respec"
cp -p "$RESPEC_DIR/builds/respec-w3c."* "$deploydir/js/"

latest=$(git describe --abbrev=0 --tags 2>/dev/null || echo "")

if compgen -G "versions/[23456789].*.md" > /dev/null; then
  allVersions=$(ls -1 versions/[23456789].*.md | grep -v -e "\-editors" | sort -r)
else
  allVersions=""
fi

if [ -z "$COMMAND" ]; then
  specifications=$allVersions
elif [ "$COMMAND" = "latest" ]; then
  if [ -z "$latest" ]; then echo "Error: no git tags found"; exit 1; fi
  specifications=$(ls -1 versions/$latest.md)
elif [ "$COMMAND" = "src" ]; then
  specifications="src/$SPEC_SRC"
else
  specifications=$(ls -1 versions/$COMMAND.md)
fi

latestCopied="none"
lastMinor="-"

for specification in $specifications; do
  version=$(basename $specification .md)

  if [ "$COMMAND" = "src" ]; then
    destination="$deploydir/$version.html"
    maintainers="EDITORS.md"
  else
    destination="$deploydir/v$version.html"
    maintainers="$(dirname $specification)/$version-editors.md"
  fi

  minorVersion=${version:0:3}
  tempfile="$deploydir/temp/$version.html"
  tempfile2="$deploydir/temp/$version-2.html"

  echo === Building $version to $destination

  node "$SCRIPT_DIR/md2html.js" --spec-config "$CONFIG_FILE" --maintainers "$maintainers" "$specification" "$allVersions" > "$tempfile"
  "$RESPEC_BIN" --no-sandbox --use-local --src $tempfile --out $tempfile2
  # remove unwanted Google Tag Manager and Google Analytics scripts
  sed -e 's/<script type="text\/javascript" async="" src="https:\/\/www.google-analytics.com\/analytics.js"><\/script>//' \
      -e 's/<script type="text\/javascript" async="" src="https:\/\/www.googletagmanager.com\/gtag\/js?id=G-[^"]*"><\/script>//' \
      $tempfile2 > $destination

  echo === Built $destination

  if [ -n "$latest" ] && [ $version = $latest ]; then
    if [[ ${version} != *"rc"* ]]; then
      # version is not a Release Candidate
      ln -sf $(basename $destination) $deploydir/latest.html
      latestCopied="v$version"
    fi
  fi

  if [ "$COMMAND" != "src" ] && [ ${minorVersion} != ${lastMinor} ] && [[ ${minorVersion} =~ ^[3-9] ]]; then
    ln -sf $(basename $destination) $deploydir/v$minorVersion.html
    lastMinor=$minorVersion
  fi
done

if [ "$latestCopied" != "none" ]; then
  echo Latest tag is $latest, copied $latestCopied to latest.html
fi

rm -r $deploydir/js
rm -r $deploydir/temp
