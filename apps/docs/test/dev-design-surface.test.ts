import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEV_SECTION_ORDER, PAGES } from "../../../scripts/sync-docs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("developer design surface", () => {
  it("keeps architecture decisions at the bottom of the developer sidebar", () => {
    expect(DEV_SECTION_ORDER).toEqual({
      design: 1,
      guides: 2,
      reference: 3,
      adr: 4,
    });
    expect(PAGES.find((page) => page.slug === "dev/design/index")?.order).toBe(1);
    expect(PAGES.find((page) => page.slug === "dev/guides/index")?.order).toBe(2);

    const generatedRoot = mkdtempSync(resolve(tmpdir(), "botharness-docs-nav-"));
    const contentRoot = resolve(generatedRoot, "content");
    try {
      execFileSync(process.execPath, [resolve(ROOT, "scripts/sync-docs.mjs")], {
        cwd: ROOT,
        env: {
          ...process.env,
          BOTHARNESS_DOCS_TEST_OUTPUT_ROOT: generatedRoot,
        },
        stdio: "ignore",
      });
      for (const tree of ["docs", "docs-zh"]) {
        for (const [section, order] of Object.entries(DEV_SECTION_ORDER)) {
          const generated = readFileSync(
            resolve(contentRoot, `${tree}/dev/${section}/index.mdx`),
            "utf8",
          );
          expect(generated).toContain(`sidebar:\n  order: ${order}`);
        }
      }
    } finally {
      rmSync(generatedRoot, { recursive: true, force: true });
    }
  });

  it("rejects an isolated output root outside the system temporary directory", () => {
    const result = spawnSync(process.execPath, [resolve(ROOT, "scripts/sync-docs.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        BOTHARNESS_DOCS_TEST_OUTPUT_ROOT: ROOT,
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "BOTHARNESS_DOCS_TEST_OUTPUT_ROOT must not overlap the repository",
    );
  });

  it("publishes stable architecture and product language, not mutable planning snapshots", () => {
    const designPages = PAGES.filter((page) => page.slug.startsWith("dev/design/"))
      .sort((a, b) => a.order - b.order)
      .map((page) => page.slug);

    expect(designPages).toEqual([
      "dev/design/index",
      "dev/design/architecture",
      "dev/design/context",
      "dev/design/bot-runtime",
    ]);
    expect(designPages).not.toContain("dev/design/platform");
    expect(designPages).not.toContain("dev/design/app-prd");
  });

  it("publishes maintained BotHarness product language in each locale", () => {
    const context = PAGES.find((page) => page.slug === "dev/design/context");

    expect(context?.en?.title).toBe("BotHarness Product Context");
    expect(context?.en?.source).toBe("GLOSSARY.md");
    expect(context?.zh?.title).toBe("BotHarness 产品术语");
    expect(context?.zh?.source).toBe("GLOSSARY.zh.md");

    const english = readFileSync(resolve(ROOT, "GLOSSARY.md"), "utf8");
    const chinese = readFileSync(resolve(ROOT, "GLOSSARY.zh.md"), "utf8");
    const leadingWords = (source: string) =>
      [...source.matchAll(/^\*\*(.+)\*\*[:：]/gm)].map((match) => match[1]);

    expect(chinese).toMatch(/^# BotHarness 产品术语$/m);
    expect(leadingWords(chinese)).toEqual(leadingWords(english));
    for (const distributionTerm of [
      "DSH Dev Docs",
      "dsh-plugin-dev",
      "dsh-skill",
      "Provenance",
    ]) {
      expect(leadingWords(english)).not.toContain(distributionTerm);
    }
  });

  it("redirects retired planning pages to the integrated architecture", () => {
    const redirects = readFileSync(resolve(ROOT, "apps/docs/public/_redirects"), "utf8");

    expect(redirects).toContain("/dev/design/platform /dev/design/architecture 301");
    expect(redirects).toContain(
      "/dev/design/platform.md /dev/design/architecture.md 301",
    );
    expect(redirects).toContain("/dev/design/app-prd /dev/design/architecture 301");
    expect(redirects).toContain(
      "/dev/design/app-prd.md /dev/design/architecture.md 301",
    );
    expect(redirects).toContain(
      "/zh/dev/design/platform /zh/dev/design/architecture 301",
    );
    expect(redirects).toContain(
      "/zh/dev/design/platform.md /zh/dev/design/architecture.md 301",
    );
    expect(redirects).toContain(
      "/zh/dev/design/app-prd /zh/dev/design/architecture 301",
    );
    expect(redirects).toContain(
      "/zh/dev/design/app-prd.md /zh/dev/design/architecture.md 301",
    );
  });
});
