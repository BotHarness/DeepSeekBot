import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { problems, touchesUI } from '../check-pr-visual-evidence.mjs';

const files = ['packages/client/src/client/settings.tsx'];
const images = `<img alt="Before light" src="https://media.botharness.ai/pr/base/light.png">

<img alt="After dark" src="https://media.botharness.ai/pr/head/dark.png">`;

const template = readFileSync(
  new URL('../../.github/pull_request_template.md', import.meta.url),
  'utf8',
);
const review = `## UI review

- [x] Object/state/next action recognisable
- [x] Every description adds a needed fact
- [x] Both themes checked
- [x] Maintained languages checked`;
const check = (body, { review: checklist = review, ...extra } = {}) =>
  problems({ files, body: `${body}\n\n${checklist}`, ...extra });

describe('UI path matching', () => {
  it.each([
    'packages/client/src/client/settings.tsx',
    'packages/client/src/client/nested/panel.tsx',
    'packages/client/src/client/styles.ts',
    'packages/client/src/client/nested/panel-styles.ios.ts',
    'packages/client/src/client/ds/tokens.ts',
    'apps/mobile/src/ui/design/tokens.ts',
    'apps/mobile/app/(tabs)/index.tsx',
  ])('includes %s', (path) => expect(touchesUI(path)).toBe(true));

  it.each([
    'packages/client/test/settings.test.tsx',
    'packages/client/src/client/settings.test.tsx',
    'packages/client/src/client/ds/__tests__/tokens.ts',
    'packages/client/src/client/ds/tokens.spec.ts',
    'apps/mobile/src/ui/panel.test.tsx',
    'apps/mobile/app/__tests__/index.tsx',
    'packages/client/src/client/host.ts',
    'packages/core/src/server.ts',
  ])('excludes %s', (path) => expect(touchesUI(path)).toBe(false));
});

describe('PR visual evidence', () => {
  it('passes non-UI and test-only changes', () => {
    expect(check('', { files: ['docs/guide.md'] })).toEqual([]);
    expect(check('', { files: ['apps/mobile/src/ui/panel.test.tsx'] })).toEqual([]);
  });

  it('names the missing light, dark, Before and After evidence', () => {
    expect(check('')).toHaveLength(4);
    for (const label of ['light', 'dark', 'Before', 'After'])
      expect(check('').some((error) => error.includes(label))).toBe(true);
    expect(check('').every((error) => error.includes('docs/agents/pr-ui-visual-evidence.md'))).toBe(
      true,
    );
  });

  it('accepts HTML images and Markdown image links', () => {
    expect(check(images)).toEqual([]);
    expect(
      check(
        '[Before LIGHT](https://media.botharness.ai/pr/base/a.png)\n\n[After DARK](https://media.botharness.ai/pr/head/b.png)',
      ),
    ).toEqual([]);
    expect(
      check(
        '![Before 浅色](https://media.botharness.ai/pr/base/a.png)\n\n![After 深色](https://media.botharness.ai/pr/head/b.png)',
      ),
    ).toEqual([]);
  });

  it('accepts themes in headings and adjacent captions', () => {
    expect(
      check(
        '### 亮色\n\n**Before**\n\n<img src="https://media.botharness.ai/a.png">\n\n### 暗色\n\n<img src=\'https://media.botharness.ai/b.png\'>\n\n**After**',
      ),
    ).toEqual([]);
  });

  it('accepts multiline HTML and labels beside a reference', () => {
    expect(
      check(`<img
      alt="Before light"
      src="https://media.botharness.ai/a.png"
    >

After [dark](https://media.botharness.ai/b.png)`),
    ).toEqual([]);
  });

  it('does not use a following section heading as a theme caption', () => {
    expect(
      check('<img alt="Before light After" src="https://media.botharness.ai/a.png">\n\n### Dark'),
    ).toEqual([expect.stringContaining('Add dark visual evidence')]);
  });

  it('requires the media origin and labels near evidence', () => {
    expect(
      check(images.replaceAll('media.botharness.ai/', 'media.botharness.ai.evil/')),
    ).toHaveLength(4);
    expect(check(images.replaceAll('https:', 'http:'))).toHaveLength(4);
    expect(
      check(images.replace('Before light', 'light')).some((error) => error.includes('Before')),
    ).toBe(true);
    expect(
      check(images.replace('After dark', 'After')).some((error) => error.includes('dark')),
    ).toBe(true);
    expect(
      check(
        `Before After light dark\n\nUnrelated text\n\n${images.replaceAll(/alt="[^"]*"/g, '')}`,
      ),
    ).not.toEqual([]);
  });

  it('ignores examples inside comments and fenced code', () => {
    expect(check(`<!-- ${images} -->`)).toHaveLength(4);
    expect(check(`\`\`\`html\n${images}\n\`\`\``)).toHaveLength(4);
  });

  it('skips the exemption label, bots, release PRs and reverts', () => {
    expect(check('', { labels: ['no-visual-change'] })).toEqual([]);
    expect(check('', { author: 'renovate[bot]' })).toEqual([]);
    expect(check('', { title: 'chore(release): 1.8.0' })).toEqual([]);
    expect(check('', { title: 'Revert "feat: x"' })).toEqual([]);
  });
});

describe('UI review checklist', () => {
  it('requires the UI review section', () => {
    expect(check(images, { review: '' })).toEqual([
      expect.stringContaining('Add the "UI review" section'),
    ]);
  });

  it('names every unanswered template item', () => {
    const errors = check(images, { review: template });
    expect(errors).toHaveLength(4);
    for (const label of [
      'Object/state/next action recognisable',
      'Every description adds a needed fact',
      'Both themes checked',
      'Maintained languages checked',
    ])
      expect(errors.some((error) => error.includes(label))).toBe(true);
  });

  it('accepts the checked bilingual template and inline explanations', () => {
    expect(check(images, { review: template.replaceAll('- [ ]', '- [x]') })).toEqual([]);
    expect(
      check(images, {
        review: review
          .replaceAll('- [x]', '- [ ]')
          .replaceAll(/^(.*checked|.*recognisable|.*fact)$/gm, '$1: verified in the review'),
      }),
    ).toEqual([]);
    expect(check(images, { review: review.replaceAll('[x]', '[X]') })).toEqual([]);
  });

  it('fails missing items and empty explanations even if another section answers them', () => {
    expect(
      check(images, {
        review: review.replace('- [x] Both themes checked', '- [ ] Both themes checked: '),
      }),
    ).toEqual([expect.stringContaining('Both themes checked')]);
    expect(
      check(images, {
        review:
          review.replace('- [x] Both themes checked', '') + '\n## Other\n- [x] Both themes checked',
      }),
    ).toEqual([expect.stringContaining('Both themes checked')]);
    expect(check(images, { review: `<!-- ${review} -->` })).toEqual([
      expect.stringContaining('Add the "UI review" section'),
    ]);
  });
});

describe('CLI', () => {
  it('reads files, metadata and comma-separated labels, with actionable exit codes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pr-visual-evidence-'));
    try {
      const bodyFile = join(dir, 'body.md');
      const filesFile = join(dir, 'files.txt');
      writeFileSync(bodyFile, `${images}\n\n${review}`);
      writeFileSync(filesFile, `${files[0]}\r\n`);
      const args = [
        fileURLToPath(new URL('../check-pr-visual-evidence.mjs', import.meta.url)),
        '--title',
        'feat: visual evidence',
        '--author',
        'human',
        '--body-file',
        bodyFile,
        '--files-file',
        filesFile,
      ];
      const run = (extra = []) =>
        spawnSync(process.execPath, [...args, ...extra], {
          encoding: 'utf8',
          shell: false,
          windowsHide: true,
        });
      expect(run().status).toBe(0);
      writeFileSync(bodyFile, '');
      const failed = run();
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain('Add light visual evidence');
      expect(failed.stderr).toContain('UI review');
      expect(run(['--labels', 'other, no-visual-change']).status).toBe(0);
      writeFileSync(filesFile, 'scripts/tool.mjs\n');
      expect(run().status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
