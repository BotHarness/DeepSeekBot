import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CSS_OUTPUT,
  STYLEX_OUTPUT,
  contrast,
  readResolver,
  renderCss,
  renderStylex,
  resolveTokens,
  webTokens,
} from '../../../scripts/generate-tokens.mjs';
import { RULES, compare, scan } from '../../../scripts/check-design-tokens.mjs';
import {
  TOBS_ACCENT_ROLES,
  TOBS_ACCENTS,
  TOBS_STYLES,
  TOBS_TOKENS,
} from '../src/client/ds/tobs-tokens.generated.js';
import { tobsTokens } from '../src/client/tobs-theme.js';

const SCHEMES = ['light', 'dark'] as const;
const SURFACES = [
  '--tobs-layer-canvas',
  '--tobs-layer-raised',
  '--tobs-layer-well',
  '--tobs-layer-field',
  '--tobs-layer-nav',
  '--tobs-layer-sheet',
  '--tobs-layer-elevated',
] as const;
const SELECTION_SURFACES = ['--tobs-layer-canvas', '--tobs-layer-nav', '--tobs-layer-sheet'];
const resolver = readResolver();
const contexts = (name: string) => Object.keys(resolver.modifiers[name]?.contexts ?? {});
const COMBINATIONS = contexts('mode').flatMap((mode) =>
  contexts('style').flatMap((style) =>
    contexts('accent').map((accent) => ({ mode, style, accent })),
  ),
);

function resolved(input: { mode: string; style: string; accent: string }) {
  const leaves = resolveTokens(input, resolver);
  const value = (path: string) => {
    const leaf = leaves.find((l) => l.path.join('.') === path);
    if (!leaf) throw new Error(`missing ${path}`);
    return leaf.value;
  };
  return value;
}

describe('Tobs design tokens', () => {
  it('keeps the generated outputs in step with the token source', () => {
    const tokens = webTokens();
    expect(readFileSync(CSS_OUTPUT, 'utf8')).toBe(renderCss(tokens));
    expect(readFileSync(STYLEX_OUTPUT, 'utf8')).toBe(renderStylex(tokens));
  });

  it('defines the same custom properties in every mode, accent and style', () => {
    expect(Object.keys(TOBS_TOKENS.dark)).toEqual(Object.keys(TOBS_TOKENS.light));
    for (const name of Object.keys(TOBS_TOKENS.light)) expect(name).toMatch(/^--tobs-[a-z0-9-]+$/);
    for (const preset of Object.values(TOBS_ACCENT_ROLES))
      expect(Object.keys(preset.dark)).toEqual(Object.keys(preset.light));
    const styleKeys = Object.keys(TOBS_STYLES.a);
    for (const style of Object.values(TOBS_STYLES)) expect(Object.keys(style)).toEqual(styleKeys);
    for (const name of styleKeys) expect(name).toMatch(/^--tobs-style-[a-z0-9-]+$/);
  });

  it(`covers ${COMBINATIONS.length} mode, style and accent combinations`, () => {
    expect(COMBINATIONS.length).toBe(
      contexts('mode').length * contexts('style').length * contexts('accent').length,
    );
  });

  it.each(COMBINATIONS)('meets the contrast rules in $mode, style $style, $accent', (input) => {
    const v = resolved(input);
    const surfaces = SURFACES.map((s) => v(`web.color.layer.${s.slice('--tobs-layer-'.length)}`));
    const on = (fg: string, bg: string, min: number, label: string) =>
      expect(contrast(fg, bg), label).toBeGreaterThanOrEqual(min);
    for (const [i, surface] of surfaces.entries()) {
      for (const ink of ['primary', 'secondary', 'tertiary'])
        on(v(`web.color.ink.${ink}`), surface, 4.5, `ink.${ink} on ${SURFACES[i]}`);
      on(v('web.color.ink.quiet'), surface, 3, `ink.quiet on ${SURFACES[i]}`);
      on(v('web.color.accent.ink'), surface, 4.5, `accent.ink on ${SURFACES[i]}`);
      on(v('web.color.accent.focus'), surface, 3, `accent.focus on ${SURFACES[i]}`);
      on(v('web.color.accent.solid'), surface, 3, `accent.solid on ${SURFACES[i]}`);
    }
    for (const name of SELECTION_SURFACES)
      on(
        v('web.color.state.selected'),
        v(`web.color.layer.${name.slice('--tobs-layer-'.length)}`),
        1.1,
        `state.selected on ${name}`,
      );
    on(v('web.color.state.selected-ink'), v('web.color.state.selected'), 4.5, 'selected ink');
    on(v('web.color.accent.ink'), v('web.color.state.selected'), 4.5, 'accent.ink on selected');
    on(v('web.color.accent.on-solid'), v('web.color.accent.solid'), 4.5, 'on-solid');
    on(v('web.color.accent.on-solid'), v('web.color.accent.solid-hover'), 4.5, 'on-solid hover');
    on(v('web.color.accent.on-container'), v('web.color.accent.container'), 4.5, 'on-container');
    on(v('web.color.accent.ink'), v('web.color.accent.tint'), 4.5, 'accent.ink on tint');
    on(v('web.color.accent.on-selection'), v('web.color.accent.selection'), 4.5, 'on-selection');
    for (const tone of ['danger', 'warning', 'success'])
      on(
        v(`web.color.status.${tone}.ink`),
        v(`web.color.status.${tone}.tint`),
        4.5,
        `${tone} ink on tint`,
      );
  });

  it('applies the generated role set for a preset and mixes only a custom colour', () => {
    const blue = tobsTokens('light', 'classic-blue');
    expect(blue).toEqual({ ...TOBS_TOKENS.light, ...TOBS_STYLES.a });
    const green = tobsTokens('dark', 'forest-green');
    expect(green).toMatchObject(TOBS_ACCENT_ROLES['forest-green'].dark);
    expect(green['--tobs-layer-canvas']).toBe(TOBS_TOKENS.dark['--tobs-layer-canvas']);
    expect(tobsTokens('dark', 'forest-green', TOBS_ACCENTS['forest-green'].dark)).toEqual(green);
    const custom = tobsTokens('light', 'classic-blue', '#aa3366');
    expect(custom['--tobs-accent-solid']).toBe('#aa3366');
    expect(custom['--tobs-accent-tint']).toMatch(/^color-mix/);
    for (const scheme of SCHEMES)
      for (const primary of ['#f8f9fa', '#1b1c1f']) {
        const t = tobsTokens(scheme, 'classic-blue', primary);
        for (const surface of SURFACES)
          expect(
            contrast(t['--tobs-line-focus'] ?? '', t[surface] ?? ''),
            `focus for ${primary} on ${surface} in ${scheme}`,
          ).toBeGreaterThanOrEqual(3);
      }
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
    expect(match('rawControl', '<button onClick={() => go()} className={styles.x}>')).toBe(true);
    expect(match('rawControl', '<NavItem label="x" />')).toBe(false);
    expect(match('legacyCss', '.bh-thing { color: var(--tobs-ink-primary); }')).toBe(true);
    expect(match('literalColor', "const s = stylex.create({ a: { color: '#ff0000' } });")).toBe(
      true,
    );
    expect(match('literalColor', "color: 'var(--tobs-ink-primary)'")).toBe(true);
    expect(match('literalColor', 'color: ink.primary')).toBe(false);
    expect(match('inlineStyle', "<div style={{ width: '12px' }} />")).toBe(true);
    expect(match('lineBorder', 'border: ${border.hairline} solid ${color.border};')).toBe(true);
    expect(match('lineBorder', "borderBottomStyle: 'solid'")).toBe(true);
    expect(match('lineBorder', "borderStyle: 'none'")).toBe(false);
  });
});
