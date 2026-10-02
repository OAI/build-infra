import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, test, expect } from "vitest";
import { registerMd2htmlFixtureTests } from "@oai/build-infra/test/md2html";

const folder = "./tests/md2html/fixtures/";
registerMd2htmlFixtureTests({ configPath: "tests/md2html/spec.config.json" });

describe("md2html", async () => {
  test("can use a Markdown Abstract as ReSpec's unnumbered abstract", async () => {
    const temp = mkdtempSync(join(tmpdir(), "oai-markdown-abstract-"));
    try {
      writeFileSync(join(temp, "spec.config.json"), JSON.stringify({
        shortName: "Overlay Specification",
        titleName: "Overlay Specification",
        abstractQuestion: "What is the Overlay Specification?",
        abstractText: "This configured fallback must not be used.",
        extractAbstractFromMarkdown: true,
      }));

      const output = await md2html(
        [
          "--spec-config",
          join(temp, "spec.config.json"),
          "--maintainers",
          "basic-new.maintainers",
          "abstract-section.md.txt",
        ],
        folder,
      );

      expect(output.code).to.equal(0);
      expect(output.stdout).toContain(
        '<section class="notoc" id="abstract"><h2>What is the Overlay Specification?</h2>The extracted abstract describes [[OpenAPI]].',
      );
      expect(output.stdout).not.toContain("This configured fallback must not be used.");
      expect(output.stdout).not.toMatch(/<h[1-6][^>]*>Abstract<\/h[1-6]>/);
      expect(output.stdout).toContain("<h1>Introduction</h1>");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  test("leaves a Markdown Abstract in the numbered body by default", async () => {
    const temp = mkdtempSync(join(tmpdir(), "oai-numbered-abstract-"));
    try {
      writeFileSync(join(temp, "spec.config.json"), JSON.stringify({
        shortName: "Overlay Specification",
        abstractQuestion: "What is the Overlay Specification?",
        abstractText: "The configured abstract remains introductory.",
      }));

      const output = await md2html(
        [
          "--spec-config",
          join(temp, "spec.config.json"),
          "--maintainers",
          "basic-new.maintainers",
          "abstract-section.md.txt",
        ],
        folder,
      );

      expect(output.code).to.equal(0);
      expect(output.stdout).toContain("The configured abstract remains introductory.");
      expect(output.stdout).toMatch(/<h[1-6][^>]*>Abstract<\/h[1-6]>/);
      expect(output.stdout).toContain("The extracted abstract describes [[OpenAPI]].");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  test("rejects extraction when the Markdown Abstract is missing", async () => {
    const temp = mkdtempSync(join(tmpdir(), "oai-missing-abstract-"));
    try {
      writeFileSync(join(temp, "spec.config.json"), JSON.stringify({
        extractAbstractFromMarkdown: true,
      }));

      const output = await md2html(
        [
          "--spec-config",
          join(temp, "spec.config.json"),
          "--maintainers",
          "basic-new.maintainers",
          "basic-new.md",
        ],
        folder,
      );

      expect(output.code).not.to.equal(0);
      expect(output.stderr).toContain(
        'extractAbstractFromMarkdown is enabled, but no "## Abstract" section was found',
      );
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});

function md2html(args, cwd) {
  return new Promise((res) => {
    execFile(
      "node",
      [`${resolve("./src/md2html/md2html.js")}`, ...args],
      { cwd },
      (error, stdout, stderr) => {
        res({
          code: error?.code || 0,
          error,
          stdout,
          stderr,
        });
      },
    );
  });
}
