#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${SPEC_CONFIG:-spec.config.json}"
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$PACKAGE_DIR/src/shell/bin-utils.sh"
ROOT_CONFIG="${OAI_BUILD_INFRA_ROOT_CONFIG:-$PACKAGE_DIR/configs/markdownlint-root.yaml}"
SPEC_CONFIG_LINT="${OAI_BUILD_INFRA_SPEC_CONFIG:-$PACKAGE_DIR/configs/markdownlint-spec.yaml}"
LINKSPECTOR_CONFIG="${OAI_BUILD_INFRA_LINKSPECTOR_CONFIG:-.linkspector.yml}"
MARKDOWNLINT="$(resolve_node_bin markdownlint-cli2 "$PACKAGE_DIR")"
LINKSPECTOR="$(resolve_node_bin linkspector "$PACKAGE_DIR")"
LINKSPECTOR_NODE_OPTIONS="${NODE_OPTIONS:-}"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Error: $CONFIG_FILE not found"
  exit 1
fi

SPEC_SRC=$(node -e "const c=require('./$CONFIG_FILE'); console.log(c.specSrc || 'spec.md')")
SPEC_PATH="src/$SPEC_SRC"

if [ -f "$SPEC_PATH" ]; then
  "$MARKDOWNLINT" --config "$SPEC_CONFIG_LINT" "$SPEC_PATH"
fi

"$MARKDOWNLINT" --config "$ROOT_CONFIG" "*.md"

if [ -f "$LINKSPECTOR_CONFIG" ]; then
  if [ "${OAI_BUILD_INFRA_LINKSPECTOR_NO_SANDBOX:-}" = "1" ] || { [ "${GITHUB_ACTIONS:-}" = "true" ] && [ "${OAI_BUILD_INFRA_LINKSPECTOR_NO_SANDBOX:-}" != "0" ]; }; then
    LINKSPECTOR_NODE_OPTIONS="${LINKSPECTOR_NODE_OPTIONS:+$LINKSPECTOR_NODE_OPTIONS }--require $PACKAGE_DIR/src/shell/linkspector-no-sandbox.cjs"
  fi

  NODE_OPTIONS="$LINKSPECTOR_NODE_OPTIONS" "$LINKSPECTOR" check --config "$LINKSPECTOR_CONFIG"
fi
