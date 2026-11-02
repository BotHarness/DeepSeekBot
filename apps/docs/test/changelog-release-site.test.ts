import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { releaseLedgerSiteEntries } from "../../../scripts/sync-docs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release-level changelog site", () => {
  it("projects bilingual ledger sections into deterministic public release entries", () => {
    const english = `# DeepSeekBot Changelog

## [Unreleased]

Preparing the next release.

### Fixed

- Fixed a pending issue ([#101](https://github.com/BotHarness/BotHarness/issues/101)).

## [0.2.0] - 2026-10-01

Made bot work visible and dependable.

### Added

- Added a visible capability ([#80](https://github.com/BotHarness/BotHarness/issues/80)).

### Documentation

- Published its operator guide ([#81](https://github.com/BotHarness/BotHarness/issues/81)).
`;
    const chinese = `# DeepSeekBot 更新日志

## [Unreleased]

准备下一个版本。

### Fixed

- 修复待发布问题（[#101](https://github.com/BotHarness/BotHarness/issues/101)）。

## [0.2.0] - 2026-10-01

让 Bot 工作变得可见且可靠。

### Added

- 新增可见能力（[#80](https://github.com/BotHarness/BotHarness/issues/80)）。

### Documentation

- 发布操作指南（[#81](https://github.com/BotHarness/BotHarness/issues/81)）。
`;

    expect(releaseLedgerSiteEntries(english, chinese)).toEqual([
      {
        slug: "v0.2.0",
        english: expect.stringContaining('title: "DeepSeekBot 0.2.0"'),
        chinese: expect.stringContaining('title: "DeepSeekBot 0.2.0"'),
      },
    ]);

    const [entry] = releaseLedgerSiteEntries(english, chinese);
    expect(entry?.english).toContain('description: "Made bot work visible and dependable."');
    expect(entry?.english).toContain("releaseVersion: 0.2.0");
    expect(entry?.english).toContain("tags: [Added, Documentation]");
    expect(entry?.english).toContain("## Added");
    expect(entry?.chinese).toContain('description: "让 Bot 工作变得可见且可靠。"');
    expect(entry?.chinese).not.toContain("Preparing the next release");
  });

  it("publishes the canonical Development summary alongside each dated release", () => {
    const root = mkdtempSync(resolve(tmpdir(), "botharness-changelog-site-"));
    roots.push(root);

    execFileSync(process.execPath, [resolve(ROOT, "scripts/sync-docs.mjs")], {
      cwd: ROOT,
      env: { ...process.env, BOTHARNESS_DOCS_TEST_OUTPUT_ROOT: root },
      stdio: "ignore",
    });

    const englishDirectory = resolve(root, "content/changelog");
    const chineseDirectory = resolve(root, "content/changelog-zh");
    const englishLedger = readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf8");
    const chineseLedger = readFileSync(resolve(ROOT, "CHANGELOG.zh.md"), "utf8");
    const expectedFiles = (ledger: string) => [
      "development.mdx",
      ...Array.from(
        ledger.matchAll(/^## \[(\d+\.\d+\.\d+(?:-[^\]]+)?)\] - \d{4}-\d{2}-\d{2}$/gm),
        ([, version]) => `v${version}.mdx`,
      ),
    ].sort();
    expect(expectedFiles(englishLedger)).toContain("v1.4.0.mdx");
    expect(expectedFiles(chineseLedger)).toEqual(expectedFiles(englishLedger));
    expect(readdirSync(englishDirectory).sort()).toEqual(expectedFiles(englishLedger));
    expect(readdirSync(chineseDirectory).sort()).toEqual(expectedFiles(chineseLedger));

    const english = readFileSync(resolve(englishDirectory, "development.mdx"), "utf8");
    const chinese = readFileSync(resolve(chineseDirectory, "development.mdx"), "utf8");
    expect(english).toContain('title: "Pre-release development"');
    expect(english).toContain("developmentSummary: true");
    expect(english).not.toContain("releaseVersion:");
    expect(chinese).toContain('title: "首个版本前的开发进展"');
    expect(chinese).toContain("developmentSummary: true");
  });
});
