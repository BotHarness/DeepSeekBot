import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  axeProblems,
  geometryProblems,
  overflowProblems,
  pixelProblems,
} from '../check-ui-visual.mjs';
import { caseFiles, manifestFrom } from '../ui-visual-baseline.mjs';

const { PNG } = createRequire(import.meta.url)('pngjs');

function image(width, height, paint = () => [255, 255, 255]) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const [r, g, b] = paint(x, y);
      png.data.set([r, g, b, 255], at);
    }
  return PNG.sync.write(png);
}

const served = (bytes) => async () => ({ ok: true, arrayBuffer: async () => bytes });

const aligned = {
  id: 'a-light-en',
  rowHeight: 28,
  iconSlot: 20,
  heading: { labelX: 40 },
  items: [
    { label: 'General', labelX: 40, slotWidth: 20, height: 28 },
    { label: 'Appearance', labelX: 40.3, slotWidth: 20, height: 28 },
  ],
};

describe('check-ui-visual', () => {
  it('passes rows on one label column at the token height', () => {
    expect(geometryProblems([aligned])).toEqual([]);
  });

  it('names a 2px heading drift, an off-column label, a short row and a narrow slot', () => {
    expect(
      geometryProblems([
        {
          ...aligned,
          heading: { labelX: 42 },
          items: [aligned.items[0], { label: 'Appearance', labelX: 44, slotWidth: 16, height: 25 }],
        },
      ]),
    ).toEqual([
      'a-light-en: nav label "Appearance" starts at x=44, not on the label column x=40',
      'a-light-en: nav row "Appearance" is 25px tall; the row token is 28px',
      'a-light-en: icon slot of "Appearance" is 16px wide; the slot token is 20px',
      'a-light-en: group heading starts at x=42, not on the label column x=40',
    ]);
  });

  it('reports horizontal page scroll and clipped text', () => {
    expect(
      overflowProblems('compact', {
        pageScroll: 12,
        clipped: [{ id: 'b-dark-zh', text: '减少动态效果', scroll: 96, client: 80 }],
      }),
    ).toEqual([
      'compact: the page scrolls 12px horizontally',
      'compact: b-dark-zh clips "减少动态效果" (96px in 80px)',
    ]);
  });

  it('passes identical pixels and fails a 2px shift with a diff image', async () => {
    const bar = (offset) => (x) =>
      x >= 10 + offset && x < 30 + offset ? [0, 0, 0] : [255, 255, 255];
    const baseline = image(100, 20, bar(0));
    const manifest = { 'a-light-en': 'https://media.botharness.ai/pr/x/a.png' };
    expect(
      await pixelProblems([{ id: 'a-light-en', png: image(100, 20, bar(0)) }], manifest, {
        fetcher: served(baseline),
      }),
    ).toEqual([]);
    const out = mkdtempSync(join(tmpdir(), 'ui-visual-test-'));
    const problems = await pixelProblems(
      [{ id: 'a-light-en', png: image(100, 20, bar(2)) }],
      manifest,
      {
        fetcher: served(baseline),
        out,
      },
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^a-light-en: \d+ pixels differ from the baseline/u);
    expect(readdirSync(out)).toEqual(['diff-a-light-en.png']);
  });

  it('names a missing baseline, a size change and an unreachable one', async () => {
    const png = image(10, 10);
    expect(
      await pixelProblems(
        [
          { id: 'new-case', png },
          { id: 'grown', png },
          { id: 'gone', png },
        ],
        { grown: 'https://m/grown.png', gone: 'https://m/gone.png' },
        {
          fetcher: async (url) =>
            url.endsWith('gone.png')
              ? { ok: false, status: 404 }
              : { ok: true, arrayBuffer: async () => image(10, 8) },
        },
      ),
    ).toEqual([
      'new-case: no baseline screenshot; adopt the new ones with node scripts/ui-visual-baseline.mjs --run <verify run id>',
      'grown: size changed from 10×8 to 10×10; review the ui-visual artifact, then node scripts/ui-visual-baseline.mjs --run <verify run id>',
      'gone: baseline https://m/gone.png answered 404',
    ]);
  });

  it('turns case screenshots and receipts into a sorted manifest', () => {
    expect(
      manifestFrom([
        ['b-dark-en', { url: 'https://m/2.png' }],
        ['a-light-en', { url: 'https://m/1.png' }],
      ]),
    ).toEqual({ 'a-light-en': 'https://m/1.png', 'b-dark-en': 'https://m/2.png' });
    const directory = mkdtempSync(join(tmpdir(), 'ui-visual-cases-'));
    for (const name of [
      'case-b-dark-en.png',
      'case-a-light-en.png',
      'gallery-wide.png',
      'diff-x.png',
    ])
      writeFileSync(join(directory, name), '');
    expect(caseFiles(directory).map(([id]) => id)).toEqual(['a-light-en', 'b-dark-en']);
  });

  it('lists each axe violation node', () => {
    expect(
      axeProblems('axe', [
        {
          id: 'color-contrast',
          impact: 'serious',
          help: 'Elements must meet minimum color contrast ratio thresholds',
          nodes: [{ target: ['#a'] }, { target: ['#b'] }],
        },
      ]),
    ).toEqual([
      'axe: color-contrast (serious) at #a: Elements must meet minimum color contrast ratio thresholds',
      'axe: color-contrast (serious) at #b: Elements must meet minimum color contrast ratio thresholds',
    ]);
  });
});
