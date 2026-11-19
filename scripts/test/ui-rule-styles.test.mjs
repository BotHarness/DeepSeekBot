import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baselineGrowth, parseSource, walk } from '../check-ui-rules.mjs';
import { STYLEX_CSS_PLACEHOLDER, stylexPlugin } from '../stylex-plugin.mjs';
import { desktopStyles, fixDesktopStyles } from '../ui-rule-styles.mjs';

const file = 'packages/client/src/client/example.tsx';
const stylex = "import * as stylex from '@stylexjs/stylex';";
const inspect = (source) => desktopStyles(source, file, parseSource(source, file), walk);
const fix = (source) => fixDesktopStyles(source, file, parseSource(source, file), inspect(source));

describe('G1 rule 1', () => {
  it('finds CSS literals in StyleX and inline styles and snaps nearby dimensions', () => {
    const source = `${stylex}
const styles = stylex.create({ tile: { padding: '9px', color: '#f00', borderRadius: '14px' } });
const inline = { marginLeft: 4, width: '51px', lineHeight: 1.5 };
const view = <div style={inline} data-note="84px" />;
`;
    expect(inspect(source).map(({ text }) => text)).toEqual([
      'padding: 9px',
      'color: #f00',
      'borderRadius: 14px',
      'marginLeft: 4',
      'width: 51px',
    ]);
    expect(fix(source)).toContain('padding: space.x3');
    expect(fix(source)).toContain('borderRadius: radius.lg');
    expect(fix(source)).toContain('marginLeft: space.x2');
    expect(inspect(fix(source)).map(({ text }) => text)).toEqual(['color: #f00', 'width: 51px']);
  });

  it('accepts token expressions, relative values, and zero', () => {
    const source = `${stylex}
const styles = stylex.create({ tile: { width: '100%', padding: space.x2, color: ink.primary } });
const view = <div style={{ inset: 0, opacity: 0.5, borderRadius: radius.sm }} />;
`;
    expect(inspect(source)).toEqual([]);
  });
});

describe('G1 rule 2', () => {
  it('uses the nearest generated breakpoint in StyleX, CSS and matchMedia', async () => {
    const source = `${stylex}
const styles = stylex.create({ tile: { display: { default: 'block', '@media (max-width: 620px)': 'none' } } });
const css = \`@media (width >= 800px) { .tile { display:none; } }\`;
const media = window.matchMedia('(min-width: 820px)');
const unrelated = 'width: 620px';
export const view = <div {...stylex.props(styles.tile)} />;
`;
    expect(inspect(source).map(({ rule, text }) => [rule, text])).toEqual([
      ['breakpoint', '620px'],
      ['breakpoint', '800px'],
      ['breakpoint', '820px'],
    ]);
    const result = fix(source);
    expect(result).toContain('[tobsMedia1.maxMedium]');
    expect(result).toContain('${breakpoint.expanded}');
    expect(inspect(result)).toEqual([]);
    const compiler = stylexPlugin({ rootDir: process.cwd() });
    const tokens = resolve('packages/client/src/client/ds/tobs.stylex.ts');
    await compiler.transform(readFileSync(tokens, 'utf8'), tokens);
    await compiler.transform(result, resolve(file));
    expect(compiler.renderChunk(STYLEX_CSS_PLACEHOLDER).code).toContain(
      '@media (max-width: 600px)',
    );
  });

  it('reports non-pixel thresholds without assuming a viewport font size', () => {
    const source = "const media = window.matchMedia('(max-width: 40rem)');";
    expect(inspect(source)).toMatchObject([{ rule: 'breakpoint', text: '40rem' }]);
    expect(fix(source)).toBe(source);
  });
});

describe('G1 rule 6', () => {
  it('reports duration and easing literals and requires reduced motion on the affected block', () => {
    const source = `${stylex}
const styles = stylex.create({
  card: { transition: 'opacity 140ms ease-out' },
  other: { '@media (prefers-reduced-motion: reduce)': { transition: 'none' } },
});
const css = \`.tile {animation: pulse .2s steps(2);}
@media (prefers-reduced-motion: reduce) { .tile {animation:none;} }\`;
`;
    expect(inspect(source).map(({ rule }) => rule)).toEqual([
      'motionToken',
      'motionToken',
      'reducedMotion',
      'motionToken',
      'motionToken',
    ]);
    const result = fix(source);
    expect(result).toContain('${tobsMotion1.fast}');
    expect(result).toContain('${tobsMotion1.base}');
    expect(inspect(result).map(({ text }) => text)).toEqual(['transition', 'animation: steps(2)']);
  });

  it('accepts a tokenized transition or animation with its own reduced-motion override', () => {
    const source = `${stylex}
const styles = stylex.create({
  control: { transitionProperty: 'opacity', transitionDuration: {
    default: motion.fast, '@media (prefers-reduced-motion: reduce)': '0ms',
  } },
});
const css = \`.tile {animation: pulse \${motion.base};}
@media (prefers-reduced-motion: reduce) { .tile {animation:none;} }\`;
`;
    expect(inspect(source)).toEqual([]);
  });
});

it('allows a new rule seed but prevents existing entries from being added or replaced', () => {
  const previous = { styleLiteral: { 'a.tsx': ['old', 'old'] }, reducedMotion: {} };
  expect(
    baselineGrowth(
      { styleLiteral: { 'a.tsx': ['old'] }, reducedMotion: {}, breakpoint: { 'a.tsx': ['600px'] } },
      previous,
    ),
  ).toEqual([]);
  expect(
    baselineGrowth(
      { styleLiteral: { 'a.tsx': ['new', 'old'] }, reducedMotion: { 'a.tsx': ['animation'] } },
      previous,
    ),
  ).toEqual(['styleLiteral a.tsx "new"', 'reducedMotion a.tsx "animation"']);
  expect(baselineGrowth({ styleLiteral: {} }, previous)).toEqual([
    'missing baseline key reducedMotion; keep an empty object when the last finding is fixed',
  ]);
});
