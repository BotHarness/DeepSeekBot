import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evidenceImages, problems, uiPaths } from '../check-pr-visual-evidence.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const template = readFileSync(join(root, '.github', 'pull_request_template.md'), 'utf8');

const image = (name) => `<img src="https://media.botharness.ai/pr/8ae46a7c62a9/${name}.png">`;
const ui = ['packages/client/src/client/styles.ts'];

const filled = `## Special things to note

- Design review: the composer reads as the input; no new copy; light and dark, zh and en.

## Change outline

Before / After.

Light:
${image('a')}

Dark (unchanged):
${image('b')}
`;

describe('check-pr-visual-evidence', () => {
  it('picks rendered UI paths and skips tests and non-UI code', () => {
    expect(
      uiPaths([
        'packages/client/src/client/channel-dock.tsx',
        'packages/client/src/client/styles.ts',
        'packages/client/src/client/ds/row.stylex.ts',
        'packages/client/src/client/ds/panel-scrollbars.ts',
        'packages/client/test/styles-tokens.test.ts',
        'apps/mobile/src/ui/chat/composer.tsx',
        'apps/mobile/app/(tabs)/index.tsx',
        'apps/mobile/src/host/client.ts',
        'scripts/ci-plan.mjs',
      ]),
    ).toEqual([
      'packages/client/src/client/channel-dock.tsx',
      'packages/client/src/client/styles.ts',
      'packages/client/src/client/ds/row.stylex.ts',
      'apps/mobile/src/ui/chat/composer.tsx',
      'apps/mobile/app/(tabs)/index.tsx',
    ]);
  });

  it('passes a UI PR with light and dark Before/After images and a design review', () => {
    expect(problems({ title: 'fix: x', body: filled, paths: ui })).toEqual([]);
  });

  it('asks nothing of a PR that changes no UI files', () => {
    expect(problems({ title: 'feat: x', body: '', paths: ['scripts/ci-plan.mjs'] })).toEqual([]);
  });

  it('accepts the no-visual-change label, bots and release PRs', () => {
    expect(problems({ body: '', paths: ui, labels: ['no-visual-change'] })).toEqual([]);
    expect(problems({ body: '', paths: ui, author: 'renovate[bot]' })).toEqual([]);
    expect(problems({ title: 'chore(release): 1.7.0', body: '', paths: ui })).toEqual([]);
  });

  it('fails the untouched template on every rule', () => {
    expect(problems({ title: 'feat: x', body: template, paths: ui })).toEqual([
      'Embed light and dark Before/After screenshots from https://media.botharness.ai/ in "Change outline" (pnpm evidence:publish), or add the `no-visual-change` label when nothing renders differently.',
      'Replace the template text after `Design review:` with your answers.',
    ]);
  });

  it('names the missing theme and the missing Before/After labels', () => {
    const body = `- Design review: checked.\n\nLight:\n${image('a')}\n\n${image('b')}\n`;
    expect(problems({ body, paths: ui })).toEqual([
      'Add a dark-theme screenshot: put "Dark" (or 深色) in its heading, caption or alt text.',
      'Label the screenshots Before and After (改前/改后) so reviewers can compare them.',
    ]);
  });

  it('reads the theme from alt text, Markdown images and Chinese captions', () => {
    const body = [
      '<img alt="Before: settings, dark" src="https://media.botharness.ai/pr/x/1.png">',
      '',
      '浅色',
      '![改后](https://media.botharness.ai/pr/x/2.png)',
      '',
      '![light](https://example.com/3.png)',
    ].join('\n');
    expect(evidenceImages(body)).toEqual([
      { url: 'https://media.botharness.ai/pr/x/1.png', light: false, dark: true },
      { url: 'https://media.botharness.ai/pr/x/2.png', light: true, dark: false },
    ]);
  });

  it('counts filtered embeds and plain links, and reads table and section headings', () => {
    const body = [
      '### Light',
      '',
      '`` &lt;img src="https://media.botharness.ai/pr/x/1.png"&gt; ``',
      '',
      '| State | Dark before | Dark after |',
      '| --- | --- | --- |',
      '| Open | [Before](https://media.botharness.ai/pr/x/2.png) | [After](https://media.botharness.ai/pr/x/3.png) |',
    ].join('\n');
    expect(evidenceImages(body)).toEqual([
      { url: 'https://media.botharness.ai/pr/x/1.png', light: true, dark: false },
      { url: 'https://media.botharness.ai/pr/x/2.png', light: true, dark: true },
      { url: 'https://media.botharness.ai/pr/x/3.png', light: true, dark: true },
    ]);
  });

  it('does not carry a caption across an earlier image', () => {
    const body = `Dark:\n${image('a')}\n${image('b')}\n`;
    expect(evidenceImages(body).map((entry) => entry.dark)).toEqual([true, false]);
  });

  it('asks for the design review line', () => {
    const body = filled.replace(/- Design review:.*\n/u, '');
    expect(problems({ body, paths: ui })).toEqual([
      'Add a `Design review:` line under "Special things to note": say how the object, state and next action read, that each description adds a needed fact, and which themes and languages you checked.',
    ]);
  });
});
