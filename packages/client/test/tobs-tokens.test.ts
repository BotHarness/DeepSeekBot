import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CSS_OUTPUT,
  STYLEX_OUTPUT,
  contrast,
  renderCss,
  renderStylex,
  webTokens,
} from '../../../scripts/generate-tokens.mjs';
import { RULES, compare, scan } from '../../../scripts/check-design-tokens.mjs';
import { TOBS_ACCENTS, TOBS_TOKENS } from '../src/client/ds/tobs-tokens.generated.js';
import { tobsTokens } from '../src/client/tobs-theme.js';

const SCHEMES = ['light', 'dark'] as const;
const SURFACES = ['--tobs-layer-canvas', '--tobs-layer-raised', '--tobs-layer-well'] as const;

describe('Tobs design tokens', () => {
  it('keeps the generated outputs in step with the token source', () => {
    const tokens = webTokens();
    expect(readFileSync(CSS_OUTPUT, 'utf8')).toBe(renderCss(tokens));
    expect(readFileSync(STYLEX_OUTPUT, 'utf8')).toBe(renderStylex(tokens));
  });

  it('defines the same custom properties in both schemes', () => {
    expect(Object.keys(TOBS_TOKENS.dark)).toEqual(Object.keys(TOBS_TOKENS.light));
    for (const name of Object.keys(TOBS_TOKENS.light)) expect(name).toMatch(/^--tobs-[a-z0-9-]+$/);
  });

  it.each(SCHEMES)('meets the contrast gate on every surface in %s', (scheme) => {
    const t = TOBS_TOKENS[scheme];
    for (const surface of SURFACES) {
      for (const ink of ['--tobs-ink-primary', '--tobs-ink-secondary'] as const)
        expect(contrast(t[ink], t[surface]), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      for (const mark of ['--tobs-ink-tertiary', '--tobs-accent-base'] as const)
        expect(contrast(t[mark], t[surface]), `${mark} on ${surface}`).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(t['--tobs-state-selected-ink'], t['--tobs-state-selected'])).toBeGreaterThan(
      4.5,
    );
    for (const tone of ['danger', 'warning', 'success'] as const)
      expect(
        contrast(t[`--tobs-status-${tone}-ink`], t[`--tobs-status-${tone}-tint`]),
        `${tone} ink on tint`,
      ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--tobs-ink-on-accent'], t['--tobs-accent-base'])).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('swaps only the accent family for a preset', () => {
    const blue = tobsTokens('light', 'classic-blue');
    expect(blue).toEqual(TOBS_TOKENS.light);
    const green = tobsTokens('dark', 'forest-green');
    expect(green['--tobs-accent-base']).toBe(TOBS_ACCENTS['forest-green'].dark);
    expect(green['--tobs-layer-canvas']).toBe(TOBS_TOKENS.dark['--tobs-layer-canvas']);
    expect(green['--tobs-line-focus']).toBe(TOBS_ACCENTS['forest-green'].dark);
    expect(tobsTokens('light', 'classic-blue', '#aa3366')['--tobs-accent-base']).toBe('#aa3366');
  });
});

describe('design token guard', () => {
  it('passes against the checked-in baseline', () => {
    const baseline = JSON.parse(
      readFileSync(new URL('../../../scripts/design-token-baseline.json', import.meta.url), 'utf8'),
    );
    expect(compare(scan(), baseline)).toEqual([]);
  });

  it('refuses new DSH uses and asks for the baseline to shrink', () => {
    const baseline = { 'a.tsx': { dshToken: 2 } };
    expect(compare({ 'a.tsx': { dshToken: 3 } }, baseline)[0]).toMatch(/1 new dshToken/);
    expect(compare({ 'a.tsx': { dshToken: 1 } }, baseline)[0]).toMatch(/shrink the baseline/);
    expect(compare({ 'b.tsx': { rawControl: 1 } }, {})[0]).toMatch(/compose a ds\/ control/);
  });

  it('recognises each forbidden form', () => {
    const match = (rule: keyof typeof RULES, source: string) =>
      (source.match(RULES[rule].pattern)?.length ?? 0) > 0;
    expect(match('dshToken', "color: 'var(--dsw-alias-label-primary)'")).toBe(true);
    expect(
      match('dshImport', "import { Button } from '@deepseek-ai/dsh-client-ui-primitives';"),
    ).toBe(true);
    expect(match('rawControl', '<button type="button" {...stylex.props(styles.x)}>')).toBe(true);
    expect(match('rawControl', '<NavItem label="x" />')).toBe(false);
  });
});
