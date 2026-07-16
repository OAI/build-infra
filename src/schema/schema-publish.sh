#!/usr/bin/env bash
set -euo pipefail

# Author: @ralfhandl

# Run this script from the root of the repo. It is designed to be run by a GitHub workflow.
#
# Optional environment variables:
#   SPEC_CONFIG path to the spec config file, default: spec.config.json
#   SPEC_SLUG   short identifier used in deploy paths, e.g. "oas", "overlay", "lifecycle"
#
# The list of schemas to publish is read from spec.config.json under the "schemas" key.
# Default if not specified: ["schema.yaml"]
# OAS additionally uses: ["meta.yaml", "dialect.yaml", "schema.yaml", "schema-base.yaml"]

CONFIG_FILE="${SPEC_CONFIG:-spec.config.json}"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Error: $CONFIG_FILE not found"
  exit 1
fi

SPEC_SLUG="${SPEC_SLUG:-$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.slug || 'spec')")}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$PACKAGE_DIR/src/shell/bin-utils.sh"
YAML_BIN="$(resolve_node_bin yaml "$PACKAGE_DIR")"

schemaDir="src/schemas/validation"
branch=$(git branch --show-current)


COMMAND="${1:-}"

if [ -z "$COMMAND" ]; then
  if [[ $branch =~ ^v([0-9]+\.[0-9]+)-dev$ ]]; then
    version="${BASH_REMATCH[1]}"
    deploydir="./deploy/$SPEC_SLUG/${version}"
  else
    echo "Unable to determine version from branch name; should be vX.Y-dev"
    exit 1
  fi
elif [ "$COMMAND" = "src" ]; then
  version="deploy-preview"
  deploydir="./deploy-preview"
else
  echo "Unrecognized argument"
  exit 1
fi

# create the date-stamped schemas
publish_schema() {
  local schema="$1"
  local date="$2"
  local sedCmd="$3"

  local base=$(basename $schema '.yaml')
  local target=$deploydir/$base/$date

  mkdir -p $deploydir/$base

  # replace the WORK-IN-PROGRESS placeholders
  sed ${sedCmd[@]} $schemaDir/$schema | "$YAML_BIN" --json --indent 2 --single > $target

  # find the jekyll lander markdown file
  local jekyllLander=$(find "$deploydir/$base" -maxdepth 1 -name "*.md")

  # rename or create the jekyll lander markdown file for this iteration
  if [ ! -z "$jekyllLander" ]; then
    if [ "$jekyllLander" = "$target.md" ]; then
      echo " * $base did not change since $date"
    else
      mv $jekyllLander $target.md
      echo " * $base: $date added & jekyll lander moved from $(basename $jekyllLander)"
    fi
  else
    # find the most recent preceding version
    local lastdir=""; for fn in $(dirname $deploydir)/?.?; do [ -d "$fn" ] && test "$fn" "<" "$deploydir" && lastdir="$fn"; done
    local lastVersion=""
    local lastLander=""
    # find the jekyll lander markdown file for the preceding version
    if [ -n "$lastdir" ]; then
      lastVersion=$(basename $lastdir)
      lastLander=$(find "$lastdir/$base" -maxdepth 1 -name "*.md" 2>/dev/null)
    fi

    if [ ! -z "$lastLander" ]; then
      # copy and adjust the lander file from the preceding version
      sed "s/$lastVersion/$version/g" $lastLander > $target.md
      echo " * $base: $date added & jekyll lander copied from $(basename $lastLander) of $lastVersion"
    else
      echo " * $base: $date added"
    fi
  fi
}

echo === Building schemas into $deploydir

# list of schemas to process, dependent schemas come first
# read from spec.config.json if present, otherwise default to schema.yaml only
schemas=()
if [ -f "$CONFIG_FILE" ]; then
  while IFS= read -r line; do
    schemas+=("$line")
  done < <(node -e "const c=require('./$CONFIG_FILE'); console.log((c.schemas||['schema.yaml']).join('\n'))")
else
  schemas=(schema.yaml)
fi

# publish each schema using its or any of its dependencies newest commit date
maxDate=""
sedCmds=()
for schema in "${schemas[@]}"; do
  if [ -f  "$schemaDir/$schema" ]; then
    newestCommitDate=$(git log -1 --format="%cd" --date=short "$schemaDir/$schema" || true)
    if [ -z "$newestCommitDate" ]; then
      newestCommitDate=$(date +%F)
    fi

    # the newest date across a schema and all its dependencies is its date stamp
    if [ "$newestCommitDate" \> "$maxDate" ]; then
      maxDate=$newestCommitDate
    fi

    base=$(basename $schema '.yaml')
    # add the replacement for this schema's placeholder to list of sed commands
    sedCmds+=("s/${base}\/WORK-IN-PROGRESS/${base}\/${maxDate}/g")

    publish_schema "$schema" "$maxDate" $(printf '%s;' "${sedCmds[@]}")
  fi
done

echo === Built
