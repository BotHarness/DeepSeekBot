import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, mix, renderSite, SITE_OUTPUT, siteColors } from '../generate-tokens.mjs';

const docsSurfaces = {
  light: ['#fcfcfc', '#ffffff', '#f4f4f4'],
  dark: ['#020202', '#0f0f0f', '#060606', '#272727'],
};

describe('shared site colours', () => {
  const colors = siteColors();

  it('ships both modes in a small standalone stylesheet', () => {
    const css = readFileSync(SITE_OUTPUT, 'utf8');
    expect(css).toBe(renderSite(colors));
    expect(Buffer.byteLength(css)).toBeLessThanOrEqual(2048);
  });

  it.each(Object.entries(docsSurfaces))(
    'keeps brand controls and status badges and callouts legible in %s mode',
    (mode, surfaces) => {
      const palette = colors[mode];
      for (const surface of surfaces) {
        expect(contrast(palette.brand, surface), `brand text on ${surface}`).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrast(palette['brand-hover'], surface),
          `brand graphic on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
        for (const status of ['success', 'warning', 'danger', 'info']) {
          expect(
            contrast(palette[status], surface),
            `${status} text on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
        expect(
          contrast(palette['on-solid'], mix(palette.danger, surface, 0.9)),
          'destructive hover text',
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const fill of ['brand', 'brand-hover', 'danger']) {
        expect(
          contrast(palette['on-solid'], palette[fill]),
          `text on ${fill}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const status of ['success', 'warning', 'danger', 'info']) {
        const ratio = contrast(palette[status], palette[`${status}-tint`]);
        expect(ratio, `${status} icon on tint`).toBeGreaterThanOrEqual(3);
        expect(ratio, `${status} text on tint`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
