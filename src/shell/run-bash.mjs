import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function runBash(scriptUrl, args) {
  const script = fileURLToPath(scriptUrl);
  const result = spawnSync("bash", [script, ...args], { stdio: "inherit" });

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
