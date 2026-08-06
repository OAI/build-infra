// Linkspector adds Chromium's --no-sandbox flag when it detects a root user.
// GitHub-hosted runners can also require --no-sandbox even when not running as
// root, so this shim forces Linkspector down that existing launch path.
if (typeof process.getuid === "function") {
  Object.defineProperty(process, "getuid", {
    value: () => 0,
    configurable: true,
    writable: true
  });
}
