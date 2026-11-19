import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseReleaseLedger,
  validateDshSkillReleaseLedgerPair,
} from "../../../scripts/release-ledger.mjs";
import { syncSkill } from "../../../scripts/sync-skill.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SKILL = resolve(ROOT, ".agents/skills/dsh-plugin-dev");
const RELEASE_DRAFT_FIXTURES = resolve(ROOT, "apps/docs/test/fixtures/release-draft");
const englishPath = resolve(SKILL, "CHANGELOG.md");
const chinesePath = resolve(SKILL, "CHANGELOG.zh.md");
const english = () => readFileSync(englishPath, "utf8");
const chinese = () => readFileSync(chinesePath, "utf8");

describe("DSH Skill release ledger", () => {
  it("keeps Skill SemVer separate from verified DSH provenance", () => {
    const release = parseReleaseLedger(english()).releases.find(
      ({ identity }) => identity === "0.3.4",
    );

    expect(release).toMatchObject({
      identity: "0.3.4",
      provenance: {
        skillVersion: "0.3.4",
        verifiedAgainst: "dsh 0.1.6-alpha.2",
        upstreamSha: "ddefc45fbc7f8e46dd73185e68295696d1297887",
      },
    });
    expect(release?.provenance?.skillVersion).not.toBe(
      release?.provenance?.verifiedAgainst,
    );
  });

  it("enforces bilingual provenance and the current SKILL.md release identity", () => {
    expect(
      validateDshSkillReleaseLedgerPair(english(), chinese(), {
        skillVersion: "0.3.4",
        verifiedAgainst: "dsh 0.1.6-alpha.2",
        upstreamSha: "ddefc45fbc7f8e46dd73185e68295696d1297887",
      }),
    ).toEqual([]);

    const mismatched = chinese().replace(
      "dsh 0.1.6-alpha.2",
      "dsh 0.1.7-alpha.1",
    );
    expect(
      validateDshSkillReleaseLedgerPair(english(), mismatched, {
        skillVersion: "0.3.4",
        verifiedAgainst: "dsh 0.1.6-alpha.2",
        upstreamSha: "ddefc45fbc7f8e46dd73185e68295696d1297887",
      }).map(({ code }) => code),
    ).toContain("provenance-parity");
  });

  it("binds prerelease evidence to the DSH Skill release repository", () => {
    const fixtureEnglish = readFileSync(resolve(RELEASE_DRAFT_FIXTURES, "dsh-skill.md"), "utf8");
    const fixtureChinese = readFileSync(
      resolve(RELEASE_DRAFT_FIXTURES, "dsh-skill.zh.md"),
      "utf8",
    );
    expect(validateDshSkillReleaseLedgerPair(fixtureEnglish, fixtureChinese)).toEqual([]);

    const wrongRepositoryEnglish = fixtureEnglish.replaceAll(
      "github.com/BotHarness/dsh-skill/releases",
      "github.com/BotHarness/BotHarness/releases",
    );
    const wrongRepositoryChinese = fixtureChinese.replaceAll(
      "github.com/BotHarness/dsh-skill/releases",
      "github.com/BotHarness/BotHarness/releases",
    );
    expect(
      validateDshSkillReleaseLedgerPair(
        wrongRepositoryEnglish,
        wrongRepositoryChinese,
      ).map(({ code }) => code),
    ).toEqual(["missing-prerelease-evidence", "missing-prerelease-evidence"]);
  });

  it("publishes bilingual release history with visible provenance", () => {
    const outputRoot = mkdtempSync(resolve(tmpdir(), "botharness-skill-docs-"));
    try {
      execFileSync(process.execPath, [resolve(ROOT, "scripts/sync-docs.mjs")], {
        cwd: ROOT,
        env: {
          ...process.env,
          BOTHARNESS_DOCS_TEST_OUTPUT_ROOT: outputRoot,
        },
        stdio: "ignore",
      });

      const en = readFileSync(
        resolve(outputRoot, "content/docs/dsh/releases.mdx"),
        "utf8",
      );
      const zh = readFileSync(
        resolve(outputRoot, "content/docs-zh/dsh/releases.mdx"),
        "utf8",
      );
      expect(en).toContain('title: "DSH Skill release history"');
      expect(en).toContain("**Verified against DSH:** `dsh 0.1.6-alpha.2`");
      expect(zh).toContain('title: "DSH Skill 更新日志"');
      expect(zh).toContain("**核验的 DSH 版本：** `dsh 0.1.6-alpha.2`");
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it("mirrors both release histories while keeping one Agent instruction authority", () => {
    const target = mkdtempSync(resolve(tmpdir(), "botharness-skill-mirror-"));
    try {
      syncSkill({ target });

      expect(readFileSync(resolve(target, "CHANGELOG.md"), "utf8")).toBe(
        english(),
      );
      expect(readFileSync(resolve(target, "CHANGELOG.zh.md"), "utf8")).toBe(
        chinese(),
      );
      expect(readFileSync(resolve(target, "SKILL.md"), "utf8")).toContain(
        "name: dsh-plugin-dev",
      );
      expect(() => readFileSync(resolve(target, "SKILL.zh.md"), "utf8")).toThrow();
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("gives agents distinct DeepSeekBot and DSH Skill release-train pointers", () => {
    const router = readFileSync(resolve(ROOT, "AGENTS.md"), "utf8");
    const instructions = readFileSync(
      resolve(ROOT, "docs/agents/changelog.md"),
      "utf8",
    );

    expect(router).toContain("(docs/agents/changelog.md)");
    expect(instructions).toContain("`CHANGELOG.md` and");
    expect(instructions).toContain("CHANGELOG.zh.md");
    expect(instructions).toContain(
      ".agents/skills/dsh-plugin-dev/CHANGELOG.md",
    );
    expect(instructions).toMatch(/Skill SemVer is independent/);
    expect(instructions).toContain("pnpm skill:changelog:check");
  });
});
