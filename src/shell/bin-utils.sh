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

resolve_node_package_dir() {
  local package_name="$1"
  local package_dir="$2"
  local package_local_dir="$package_dir/node_modules/$package_name"

  node -e '
    const { createRequire } = require("node:module");
    const { dirname } = require("node:path");
    const req = createRequire(`${process.cwd()}/`);
    console.log(dirname(req.resolve(`${process.argv[1]}/package.json`)));
  ' "$package_name" 2>/dev/null && return

  if [ -d "$package_local_dir" ]; then
    echo "$package_local_dir"
    return
  fi

  echo "Error: could not find package $package_name from the current repository or at $package_local_dir" >&2
  return 1
}
