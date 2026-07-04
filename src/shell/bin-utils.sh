resolve_node_bin() {
  local command_name="$1"
  local package_dir="$2"
  local package_local_bin="$package_dir/node_modules/.bin/$command_name"

  if command -v "$command_name" >/dev/null 2>&1; then
    command -v "$command_name"
    return
  fi

  if [ -x "$package_local_bin" ]; then
    echo "$package_local_bin"
    return
  fi

  echo "Error: could not find $command_name on PATH or at $package_local_bin" >&2
  return 1
}
