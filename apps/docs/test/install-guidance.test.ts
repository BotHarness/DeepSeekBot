import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSpec, renderInstallGuidance, syncInstallGuidance } from "../../../scripts/sync-install-guidance.mjs";

describe("published stable install guidance", () => {
  it("runs the CLI through a symbolic link", () => {
    const directory = mkdtempSync(join(tmpdir(), "install-guidance-entry-"));
    const entry = join(directory, "sync-install-guidance.mjs");
    try {
      const scripts = join(directory, "scripts");
      mkdirSync(scripts);
      const target = join(scripts, "sync-install-guidance.mjs");
      copyFileSync(fileURLToPath(new URL("../../../scripts/sync-install-guidance.mjs", import.meta.url)), target);
      writeFileSync(join(scripts, "install-release.json"), JSON.stringify({ version: "1.2.1" }));
      writeFileSync(join(directory, "README.md"), "enter `deepseekbot`");
      symlinkSync(target, entry);
      expect(() => execFileSync(process.execPath, [entry, "--check"], { stdio: "pipe" })).toThrow(/install instructions drift/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("updates installation specs without rewriting product identity or historical versions", () => {
    const text = "enter `deepseekbot`\n输入 `deepseekbot@1.2.0`\ndsh plugin --profile web add deepseekbot\nnpm pack deepseekbot\n```text\ndeepseekbot\n```\nThe `deepseekbot` package; historical `deepseekbot@1.2.0`.";
    const result = renderInstallGuidance(text, "1.2.1");
    expect(result).toContain("enter `deepseekbot@1.2.1`");
    expect(result).toContain("输入 `deepseekbot@1.2.1`");
    expect(result).toContain("add deepseekbot@1.2.1");
    expect(result).toContain("npm pack deepseekbot@1.2.1");
    expect(result).toContain("\ndeepseekbot@1.2.1\n");
    expect(result).toContain("historical `deepseekbot@1.2.0`");
    expect(renderInstallGuidance(result, "1.2.1")).toBe(result);
    expect(renderInstallGuidance(result, "1.2.2")).toContain("add deepseekbot@1.2.2");
    expect(renderInstallGuidance("add deepseekbot@latest", "1.2.1")).toBe("add deepseekbot@1.2.1");
  });

  it("rejects latest, ranges and prerelease identities", () => {
    for (const version of ["latest", "^1.2.1", "1.3.0-rc.1", "01.2.1"]) {
      expect(() => installSpec(version)).toThrow();
    }
  });

  it("keeps both READMEs and canonical guides synchronized", () => {
    expect(() => syncInstallGuidance(fileURLToPath(new URL("../../../", import.meta.url)), true)).not.toThrow();
  });
});
