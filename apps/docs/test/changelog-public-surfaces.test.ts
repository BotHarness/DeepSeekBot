import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DOCS = resolve(ROOT, "apps/docs");
const DIST = resolve(DOCS, "dist");

function built(path: string): string {
  return readFileSync(resolve(DIST, path), "utf8");
}

describe("built release and Development status surfaces", () => {
  it(
    "exposes one concise bilingual history unit across human and agent routes",
    { timeout: process.platform === "win32" ? 360_000 : 120_000 },
    () => {
      execFileSync(
        process.execPath,
        [resolve(DOCS, "node_modules/astro/bin/astro.mjs"), "build"],
        {
          cwd: DOCS,
          env: { ...process.env, NO_COLOR: "1" },
          stdio: "pipe",
        },
      );

      const englishFeed = built("changelog/index.html");
      const chineseFeed = built("zh/changelog/index.html");
      expect(englishFeed).toContain("Pre-release development");
      expect(englishFeed).toContain(
        "this is development history, not a released or installable version",
      );
      expect(englishFeed).not.toContain("Added durable PersonaBot identity");
      expect(englishFeed).not.toContain("Unreleased");
      expect(chineseFeed).toContain("首个版本前的开发进展");
      expect(chineseFeed).not.toContain("新增持久的 PersonaBot identity");

      const englishDetail = built("changelog/development/index.html");
      const chineseDetail = built("zh/changelog/development/index.html");
      expect(englishDetail).toContain("Added durable PersonaBot identity");
      expect(chineseDetail).toContain("新增持久的 PersonaBot identity");
      expect(englishDetail).toContain('hreflang="zh-Hans"');
      expect(chineseDetail).toContain('hreflang="en"');
      expect(englishDetail).toContain("/changelog/development/index.md");
      expect(chineseDetail).toContain("/zh/changelog/development/index.md");

      const englishRss = built("changelog/rss.xml");
      const chineseRss = built("zh/changelog/rss.xml");
      expect(englishRss.match(/<item>/g)).toHaveLength(11);
      expect(chineseRss.match(/<item>/g)).toHaveLength(11);
      expect(englishRss).toContain("/changelog/v101/");
      expect(chineseRss).toContain("/zh/changelog/v101/");
      expect(englishRss).toContain("/changelog/v102/");
      expect(chineseRss).toContain("/zh/changelog/v102/");
      expect(englishRss).toContain("/changelog/v110/");
      expect(chineseRss).toContain("/zh/changelog/v110/");
      expect(englishRss).toContain("/changelog/v120/");
      expect(chineseRss).toContain("/zh/changelog/v120/");
      expect(englishRss).toContain("/changelog/v121/");
      expect(chineseRss).toContain("/zh/changelog/v121/");
      expect(englishRss).toContain("/changelog/v130/");
      expect(chineseRss).toContain("/zh/changelog/v130/");
      expect(englishRss).toContain("/changelog/v131/");
      expect(chineseRss).toContain("/zh/changelog/v131/");
      expect(englishRss).toContain("/changelog/v140/");
      expect(chineseRss).toContain("/zh/changelog/v140/");
      expect(englishRss).toContain("/changelog/v141/");
      expect(chineseRss).toContain("/zh/changelog/v141/");
      expect(englishRss).toContain("/changelog/v150/");
      expect(chineseRss).toContain("/zh/changelog/v150/");
      expect(englishRss).toContain("/changelog/development/");
      expect(chineseRss).toContain("/zh/changelog/development/");

      expect(built("changelog/llms.txt")).toContain(
        "https://botharness.ai/changelog/development/index.md",
      );
      expect(built("zh/changelog/llms.txt")).toContain(
        "https://botharness.ai/zh/changelog/development/index.md",
      );
      expect(built("changelog/development/index.md")).toContain(
        "Added durable PersonaBot identity",
      );
      expect(built("index.html")).toContain('href="/changelog/v140"');
      expect(built("zh/index.html")).toContain('href="/zh/changelog/v140"');

      expect(
        statSync(resolve(DIST, "og/changelog/development.png")).size,
      ).toBeGreaterThan(0);
      expect(
        statSync(resolve(DIST, "og/zh/changelog/development.png")).size,
      ).toBeGreaterThan(0);
      expect(
        existsSync(resolve(DIST, "changelog/2026-09-20-roster-storage")),
      ).toBe(false);

      const statusEnglish = built("development/index.html");
      const statusChinese = built("zh/development/index.html");
      const statusEnglishMarkdown = built("development.md");
      const statusChineseMarkdown = built("zh/development.md");
      for (const state of [
        "In progress",
        "Merged, awaiting release",
        "Pre-release",
        "Released",
      ]) {
        expect(statusEnglish).toContain(state);
        expect(statusChinese).toContain(state);
        expect(statusEnglishMarkdown).toContain(`### ${state}`);
        expect(statusChineseMarkdown).toContain(`### ${state}`);
      }
      for (const artifact of ["DeepSeekBot", "DSH Skill"]) {
        expect(statusEnglish).toContain(artifact);
        expect(statusChinese).toContain(artifact);
        expect(statusEnglishMarkdown).toContain(artifact);
        expect(statusChineseMarkdown).toContain(artifact);
      }
      expect(statusEnglish).toContain(
        "not included in the latest stable artifact",
      );
      expect(statusChinese).toContain("尚未包含在最新的稳定 artifact 中");
      expect(statusEnglish).toContain("0.3.4");
      expect(statusChinese).toContain("0.3.4");
      expect(statusEnglish).not.toMatch(
        /Pre-release[\s\S]{0,600}0\.1\.6-alpha\.2/,
      );
      expect(statusChinese).not.toMatch(
        /Pre-release[\s\S]{0,600}0\.1\.6-alpha\.2/,
      );
      expect(statusEnglish).toContain('href="/zh/development"');
      expect(statusChinese).toContain('href="/development"');

      expect(built("llms.txt")).toContain(
        "https://botharness.ai/development.md",
      );
      expect(built("zh/llms.txt")).toContain(
        "https://botharness.ai/zh/development.md",
      );
      expect(built("development/index.md")).toBe(statusEnglishMarkdown);
      expect(built("zh/development/index.md")).toBe(statusChineseMarkdown);
      expect(englishFeed).not.toContain("Merged, awaiting release");
      expect(englishFeed).not.toContain("Unreleased");
    },
  );
});
