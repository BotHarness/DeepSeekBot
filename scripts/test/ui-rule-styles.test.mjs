import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baselineGrowth, parseSource, walk } from '../check-ui-rules.mjs';
import { STYLEX_CSS_PLACEHOLDER, stylexPlugin } from '../stylex-plugin.mjs';
import { desktopStyles, fixDesktopStyles } from '../ui-rule-styles.mjs';

const file = 'packages/client/src/client/example.tsx';
const stylex = "import * as stylex from '@stylexjs/stylex';";
const inspect = (source) => desktopStyles(source, file, parseSource(source, file), walk);
const fix = (source) => {
  const ast = parseSource(source, file);
  return fixDesktopStyles(source, file, ast, desktopStyles(source, file, ast, walk));
};

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

  it('checks CSS template declarations and ignores unrelated template text', () => {
    const source = `
const sheet = css\`.tile { padding: 9px; color: #f00; content: '24px'; }\`;
const note = \`padding: 12px; color: #0f0;\`;
`;
    expect(inspect(source)).toMatchObject([
      { rule: 'styleLiteral', text: 'padding: 9px', line: 2 },
      { rule: 'styleLiteral', text: 'color: #f00', line: 2 },
    ]);
  });

  it('checks style values under computed media token keys', () => {
    const source = `${stylex}
const styles = stylex.create({
  tile: {
    padding: { default: space.x2, [media.minMedium]: '9px' },
    transitionDuration: { default: motion.fast, [media.minMedium]: '149ms' },
    '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0ms' },
  },
});
`;
    expect(inspect(source)).toMatchObject([
      { rule: 'styleLiteral', text: 'padding: 9px' },
      { rule: 'motionToken', text: 'transitionDuration: 149ms' },
    ]);
  });

  it('does not reuse a shadowed token import for autofixes', () => {
    const source = `import { space } from './ds/tobs.stylex.js';
function Tile({ space }) {
  return <div style={{ padding: '9px' }} data-gap={space} />;
}
const view = <div style={{ padding: '9px' }} />;
`;
    const result = fix(source);
    expect(result).toContain("return <div style={{ padding: '9px' }} data-gap={space} />");
    expect(result).toContain('const view = <div style={{ padding: space.x3 }} />');
    expect(inspect(result)).toMatchObject([{ rule: 'styleLiteral', text: 'padding: 9px' }]);
  });

  it('reports signed numeric lengths and preserves their sign', () => {
    const source = 'const view = <div style={{ marginTop: -8, marginBottom: -0, padding: +9 }} />;';
    expect(inspect(source)).toMatchObject([
      { rule: 'styleLiteral', text: 'marginTop: -8' },
      { rule: 'styleLiteral', text: 'padding: 9' },
    ]);
    expect(fix(source)).toContain('marginTop: -8, marginBottom: -0, padding: space.x3');
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

  it('accepts both quoted forms of the reduced-motion selector', () => {
    const source = `const css = \`
.single { animation: pulse \${motion.base}; }
.double { animation: pulse \${motion.base}; }
html[data-botharness-motion='reduce'] .single { animation: none; }
html[data-botharness-motion="reduce"] .double { animation: none; }
\`;`;
    expect(inspect(source)).toEqual([]);
  });

  it('requires a reduced-motion override that changes the active motion', () => {
    const source = `${stylex}
const styles = stylex.create({
  tile: {
    transitionProperty: 'transform',
    transitionDuration: motion.fast,
    '@media (prefers-reduced-motion: reduce)': { transitionDelay: '0ms' },
  },
  card: {
    animationName: { default: pulse, '@media (prefers-reduced-motion: reduce)': pulse },
  },
});
const css = \`.tile { transition: transform \${motion.fast}; }
@media (prefers-reduced-motion: reduce) { .tile { transition-delay: 0ms; } }\`;
`;
    expect(inspect(source)).toMatchObject([
      { rule: 'reducedMotion', text: 'transitionDuration' },
      { rule: 'reducedMotion', text: 'animationName' },
      { rule: 'reducedMotion', text: '.tile transition' },
    ]);
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

it('allows rule totals to shrink or move and rejects growth for an unbudgeted rule', () => {
  const previous = { styleLiteral: { 'a.tsx': ['old', 'old'] }, reducedMotion: {} };
  expect(
    baselineGrowth({ styleLiteral: { 'b.tsx': ['old'] }, reducedMotion: {} }, previous),
  ).toEqual([]);
  expect(
    baselineGrowth(
      {
        styleLiteral: { 'a.tsx': ['old'], 'b.tsx': ['old', 'new'] },
        reducedMotion: {},
        breakpoint: { 'a.tsx': ['600px'] },
      },
      previous,
    ),
  ).toEqual([
    'breakpoint total grew from 0 to 1; counts rose in a.tsx (0 → 1)',
    'styleLiteral total grew from 2 to 3; counts rose in b.tsx (0 → 2)',
  ]);
  expect(baselineGrowth({ styleLiteral: {} }, previous)).toEqual([
    'missing baseline key reducedMotion; keep an empty object when the last finding is fixed',
  ]);
});
