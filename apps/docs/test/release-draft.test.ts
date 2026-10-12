import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { prepareReleaseDraft } from "../../../scripts/release-draft.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURES = resolve(ROOT, "apps/docs/test/fixtures/release-draft");
const fixture = (name: string) => readFileSync(resolve(FIXTURES, name), "utf8");

describe("GitHub Release draft preparation", () => {
  it("derives a deterministic DeepSeekBot documentation-only draft from one release section", () => {
    const input = {
      artifact: "deepseekbot" as const,
      version: "0.2.1",
      tag: "v0.2.1",
      githubReleaseVersion: "0.2.1",
      installableVersion: "0.2.1",
      highlights: ["A clearer upgrade path", "Compatibility guidance"],
      contributors: ["@ada", "@lin"],
      newContributors: ["@lin"],
      comparisonUrl: "https://github.com/BotHarness/BotHarness/compare/v0.2.0...v0.2.1",
      englishLedger: fixture("deepseekbot.md"),
      chineseLedger: fixture("deepseekbot.zh.md"),
    };

    const first = prepareReleaseDraft(input);
    const second = prepareReleaseDraft(input);

    expect(second).toEqual(first);
    expect(first).toEqual({
      artifact: "DeepSeekBot",
      version: "0.2.1",
      tagName: "v0.2.1",
      installableVersion: "0.2.1",
      name: "DeepSeekBot v0.2.1",
      prerelease: false,
      releasePlan: {
        canonicalVersion: "0.2.1",
        tagName: "v0.2.1",
        githubReleaseVersion: "0.2.1",
        installableArtifactVersion: "0.2.1",
        tagged: false,
        installable: false,
      },
      body: `- **官网 / Website:** [DeepSeekBot](https://deepseekbot.app/r/v0.2.1)
- **安装教程 / Installation:** [中文](https://deepseekbot.app/r/v0.2.1/install) · [English](https://deepseekbot.app/r/v0.2.1/install/en)
- **精确安装版本 / Exact install spec:** \`deepseekbot@0.2.1\`

Published a clearer compatibility guide for DeepSeekBot operators.

> Documentation-only patch: runtime behavior is unchanged.

## Highlights

- A clearer upgrade path
- Compatibility guidance

## Documentation

- Documented the supported upgrade path ([#103](https://github.com/BotHarness/BotHarness/issues/103)).

## Contributors

- @ada
- @lin

### New contributors

- @lin made their first contribution

**Full comparison:** [View all changes](https://github.com/BotHarness/BotHarness/compare/v0.2.0...v0.2.1)
`,
    });
  });

  it("starts stable product releases with user entry points", () => {
    const version = "0.2.1";
    const draft = prepareReleaseDraft({
      artifact: "deepseekbot",
      version,
      tag: `v${version}`,
      githubReleaseVersion: version,
      installableVersion: version,
      tagged: true,
      installable: true,
      comparisonUrl: `https://github.com/BotHarness/BotHarness/compare/v0.2.0...v${version}`,
      englishLedger: fixture("deepseekbot.md").replaceAll("0.2.1", version),
      chineseLedger: fixture("deepseekbot.zh.md").replaceAll("0.2.1", version),
    });

    expect(
      draft.body.startsWith(`- **官网 / Website:** [DeepSeekBot](https://deepseekbot.app/r/v${version})`),
    ).toBe(true);
    expect(draft.body).toContain(`[中文](https://deepseekbot.app/r/v${version}/install)`);
    expect(draft.body).toContain(`[English](https://deepseekbot.app/r/v${version}/install/en)`);
    expect(draft.body).toContain(`Exact install spec:** \`deepseekbot@${version}\``);
    expect(draft.body.indexOf("安装教程")).toBeLessThan(draft.body.indexOf("Published a clearer"));
  });

  it("keeps DSH Skill SemVer and verified upstream provenance independent", () => {
    const draft = prepareReleaseDraft({
      artifact: "dsh-skill",
      version: "1.2.0-rc.1",
      tag: "v1.2.0-rc.1",
      githubReleaseVersion: "1.2.0-rc.1",
      installableVersion: "1.2.0-rc.1",
      tagged: true,
      installable: true,
      comparisonUrl: "https://github.com/BotHarness/dsh-skill/compare/v1.1.0...v1.2.0-rc.1",
      currentSkillProvenance: {
        skillVersion: "1.2.0-rc.1",
        verifiedAgainst: "dsh 0.1.6-alpha.2",
        upstreamSha: "ddefc45fbc7f8e46dd73185e68295696d1297887",
      },
      englishLedger: fixture("dsh-skill.md"),
      chineseLedger: fixture("dsh-skill.zh.md"),
    });

    expect(draft.prerelease).toBe(true);
    expect(draft.name).toBe("DSH Skill v1.2.0-rc.1");
    expect(draft.body).not.toContain("deepseekbot.app");
    expect(draft.body).toContain("**Skill version:** `1.2.0-rc.1`");
    expect(draft.body).toContain("**Verified against DSH:** `dsh 0.1.6-alpha.2`");
    expect(draft.body).toContain(
      "[`ddefc45fbc7f8e46dd73185e68295696d1297887`](https://github.com/deepseek-ai/deepseek-harness/commit/ddefc45fbc7f8e46dd73185e68295696d1297887)",
    );
    expect(draft.version).not.toBe("0.1.6-alpha.2");
  });

  it("requires one version across the canonical section, tag, draft, and installable artifact", () => {
    const base = {
      artifact: "deepseekbot" as const,
      version: "0.2.1",
      tag: "v0.2.1",
      githubReleaseVersion: "0.2.1",
      installableVersion: "0.2.1",
      comparisonUrl: "https://github.com/BotHarness/BotHarness/compare/v0.2.0...v0.2.1",
      englishLedger: fixture("deepseekbot.md"),
      chineseLedger: fixture("deepseekbot.zh.md"),
    };

    expect(() => prepareReleaseDraft({ ...base, tag: "v0.2.0" })).toThrow(
      "tag must be v0.2.1",
    );
    expect(() =>
      prepareReleaseDraft({ ...base, installableVersion: "0.2.0" }),
    ).toThrow("installable artifact version must be 0.2.1");
    expect(() =>
      prepareReleaseDraft({ ...base, githubReleaseVersion: "0.2.0" }),
    ).toThrow("GitHub Release version must be 0.2.1");
    expect(() => prepareReleaseDraft({ ...base, version: "0.3.0" })).toThrow(
      "version is not a dated release in the canonical ledger",
    );
    expect(() => prepareReleaseDraft({ ...base, comparisonUrl: "" })).toThrow(
      "full comparison URL is required",
    );
    expect(() => prepareReleaseDraft({ ...base, comparisonUrl: "https://example.com/nope" })).toThrow(
      "full comparison URL must be an HTTPS GitHub comparison",
    );
    expect(() =>
      prepareReleaseDraft({
        ...base,
        comparisonUrl: "https://github.com/BotHarness/BotHarness/compare/v0.2.0...v0.3.0",
      }),
    ).toThrow("full comparison URL must be an HTTPS GitHub comparison");
    expect(() =>
      prepareReleaseDraft({
        ...base,
        comparisonUrl: "https://github.com/BotHarness/BotHarness/compare/v0.1.0...v0.2.1",
      }),
    ).toThrow("full comparison URL must be an HTTPS GitHub comparison");
  });

  it("limits announcement-only metadata and recognizes only alpha, beta, and RC prereleases", () => {
    const base = {
      artifact: "dsh-skill" as const,
      version: "1.2.0-rc.1",
      tag: "v1.2.0-rc.1",
      githubReleaseVersion: "1.2.0-rc.1",
      installableVersion: "1.2.0-rc.1",
      tagged: true,
      installable: true,
      comparisonUrl: "https://github.com/BotHarness/dsh-skill/compare/v1.1.0...v1.2.0-rc.1",
      currentSkillProvenance: {
        skillVersion: "1.2.0-rc.1",
        verifiedAgainst: "dsh 0.1.6-alpha.2",
        upstreamSha: "ddefc45fbc7f8e46dd73185e68295696d1297887",
      },
      englishLedger: fixture("dsh-skill.md"),
      chineseLedger: fixture("dsh-skill.zh.md"),
    };

    expect(() =>
      prepareReleaseDraft({ ...base, highlights: ["One", "Two", "Three", "Four"] }),
    ).toThrow("at most three highlights");

    const previewEnglish = fixture("dsh-skill.md").replaceAll(
      "1.2.0-rc.1",
      "1.2.0-preview.1",
    );
    const previewChinese = fixture("dsh-skill.zh.md").replaceAll(
      "1.2.0-rc.1",
      "1.2.0-preview.1",
    );
    expect(() =>
      prepareReleaseDraft({
        ...base,
        version: "1.2.0-preview.1",
        tag: "v1.2.0-preview.1",
        githubReleaseVersion: "1.2.0-preview.1",
        installableVersion: "1.2.0-preview.1",
        comparisonUrl:
          "https://github.com/BotHarness/dsh-skill/compare/v1.1.0...v1.2.0-preview.1",
        currentSkillProvenance: {
          ...base.currentSkillProvenance,
          skillVersion: "1.2.0-preview.1",
        },
        englishLedger: previewEnglish,
        chineseLedger: previewChinese,
      }),
    ).toThrow("prerelease channel must be alpha, beta, or rc");

    expect(() => prepareReleaseDraft({ ...base, tagged: false })).toThrow(
      "prerelease needs positive tagged and installable evidence",
    );
    expect(() => prepareReleaseDraft({ ...base, installable: false })).toThrow(
      "prerelease needs positive tagged and installable evidence",
    );
    expect(() =>
      prepareReleaseDraft({
        ...base,
        currentSkillProvenance: {
          ...base.currentSkillProvenance,
          skillVersion: "1.1.0",
        },
      }),
    ).toThrow("DSH Skill version must match current SKILL.md metadata");
  });

  it("does not mislabel a documentation-only release on a new version line as a patch", () => {
    const englishLedger = fixture("deepseekbot.md").replaceAll("0.2.1", "0.3.0");
    const chineseLedger = fixture("deepseekbot.zh.md").replaceAll("0.2.1", "0.3.0");

    const draft = prepareReleaseDraft({
      artifact: "deepseekbot",
      version: "0.3.0",
      tag: "v0.3.0",
      githubReleaseVersion: "0.3.0",
      installableVersion: "0.3.0",
      comparisonUrl:
        "https://github.com/BotHarness/BotHarness/compare/v0.2.0...v0.3.0",
      englishLedger,
      chineseLedger,
    });

    expect(draft.body).toContain("Documentation-only release: runtime behavior is unchanged.");
    expect(draft.body).not.toContain("Documentation-only patch");
  });

  it("marks a documentation-only RC as runtime unchanged without calling it a patch", () => {
    const englishLedger = fixture("deepseekbot.md")
      .replaceAll("0.2.1", "0.3.0-rc.1")
      .replace(
        "Published a clearer compatibility guide for DeepSeekBot operators.",
        `Published a clearer compatibility guide for DeepSeekBot operators.

- **Release tag:** [\`v0.3.0-rc.1\`](https://github.com/BotHarness/BotHarness/releases/tag/v0.3.0-rc.1)
- **Installable artifact:** [Download bundle](https://github.com/BotHarness/BotHarness/releases/download/v0.3.0-rc.1/deepseekbot.bundle)`,
      );
    const chineseLedger = fixture("deepseekbot.zh.md")
      .replaceAll("0.2.1", "0.3.0-rc.1")
      .replace(
        "为 DeepSeekBot 管理者发布更清晰的兼容性指南。",
        `为 DeepSeekBot 管理者发布更清晰的兼容性指南。

- **发布 tag：** [\`v0.3.0-rc.1\`](https://github.com/BotHarness/BotHarness/releases/tag/v0.3.0-rc.1)
- **可安装 artifact：** [下载 bundle](https://github.com/BotHarness/BotHarness/releases/download/v0.3.0-rc.1/deepseekbot.bundle)`,
      );
    const draft = prepareReleaseDraft({
      artifact: "deepseekbot",
      version: "0.3.0-rc.1",
      tag: "v0.3.0-rc.1",
      githubReleaseVersion: "0.3.0-rc.1",
      installableVersion: "0.3.0-rc.1",
      tagged: true,
      installable: true,
      comparisonUrl:
        "https://github.com/BotHarness/BotHarness/compare/v0.2.0...v0.3.0-rc.1",
      englishLedger,
      chineseLedger,
    });

    expect(
      draft.body.startsWith("- **官网 / Website:** [DeepSeekBot](https://deepseekbot.app/r/v0.3.0-rc.1)"),
    ).toBe(true);
    expect(draft.body).toContain("[中文](https://deepseekbot.app/r/v0.3.0-rc.1/install)");
    expect(draft.body).toContain("[English](https://deepseekbot.app/r/v0.3.0-rc.1/install/en)");
    expect(draft.body).toContain("Exact install spec:** `deepseekbot@0.3.0-rc.1`");
    expect(draft.body).toContain("Documentation-only release: runtime behavior is unchanged.");
    expect(draft.body).not.toContain("Documentation-only patch");
  });

  it("keeps the Human-selected first public version available", () => {
    const englishLedger = fixture("deepseekbot.md").replace(
      /\n## \[0\.2\.0][\s\S]*$/,
      "\n",
    );
    const chineseLedger = fixture("deepseekbot.zh.md").replace(
      /\n## \[0\.2\.0][\s\S]*$/,
      "\n",
    );
    const input = {
      artifact: "deepseekbot" as const,
      version: "0.2.1",
      tag: "v0.2.1",
      githubReleaseVersion: "0.2.1",
      installableVersion: "0.2.1",
      comparisonUrl: "https://github.com/BotHarness/BotHarness/compare/v0.0.0...v0.2.1",
      englishLedger,
      chineseLedger,
    };

    expect(prepareReleaseDraft(input).body).toContain(
      "Documentation-only release: runtime behavior is unchanged.",
    );
  });

  it("exposes a read-only dry-run CLI with sanitized failures", () => {
    const result = spawnSync(
      process.execPath,
      [
        resolve(ROOT, "scripts/release-draft.mjs"),
        "--artifact",
        "dsh-skill",
        "--version",
        "0.3.4",
        "--tag",
        "v0.3.4",
        "--github-release-version",
        "0.3.4",
        "--installable-version",
        "0.3.4",
        "--comparison-url",
        "https://github.com/BotHarness/dsh-skill/compare/v0.3.3...v0.3.4",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      artifact: "DSH Skill",
      version: "0.3.4",
      tagName: "v0.3.4",
      prerelease: false,
    });
    expect(result.stderr).toBe("");

    const failed = spawnSync(
      process.execPath,
      [resolve(ROOT, "scripts/release-draft.mjs"), "--artifact", "deepseekbot"],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(failed.status).toBe(1);
    expect(failed.stderr).toBe(
      "Release draft preparation failed: --version is required.\n",
    );
    expect(failed.stderr).not.toContain("at file:");
  });
});
