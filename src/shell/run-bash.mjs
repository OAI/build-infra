import { spawnSync } from "node:child_process";
import { delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function runBash(scriptUrl, args) {
  const script = fileURLToPath(scriptUrl);
  const projectBin = resolve("node_modules/.bin");
  const path = [projectBin, process.env.PATH].filter(Boolean).join(delimiter);
  const result = spawnSync("bash", [script, ...args], {
    env: { ...process.env, PATH: path },
    stdio: "inherit"
  });

  if (result.error) {
    console.error(`Could not run bash script ${script}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
    return;
  }

  process.exit(result.status ?? 1);
}
