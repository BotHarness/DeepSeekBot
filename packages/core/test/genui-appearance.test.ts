import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import {
  GENUI_APPEARANCE_TOKENS,
  GENUI_DEFAULT_CSS,
  GENUI_STYLE_GUIDANCE,
} from '../src/channels/genui-appearance.js';
import { parseGenuiDocument } from '../src/channels/genui-document.js';
import { buildGenuiHtmlDocument } from '../src/channels/genui-html.js';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';

function innerDocument(theme: 'light' | 'dark', html = syntheticGenuiDocument.html): string {
  const compiled = buildGenuiHtmlDocument(
    { ...syntheticGenuiDocument, html },
    { instanceId: 'appearance-test', theme },
  );
  const match = compiled.html.match(/frame\.srcdoc = ("(?:\\.|[^"\\])*");/u);
  if (!match) throw new Error('Missing isolated content document.');
  return JSON.parse(match[1]!) as string;
}

function channels(color: string): number[] {
  return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
}

function luminance(color: string): number {
  const linear = channels(color).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

function hueSector(color: string): number {
  const [red, green, blue] = channels(color) as [number, number, number];
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const hue =
    maximum === red
      ? (green - blue) / delta
      : maximum === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
  return Math.floor(((hue * 60 + 360) % 360) / 30);
}

describe('shared GenUI appearance', () => {
  const sheet = postcss.parse(GENUI_DEFAULT_CSS);
  const declarations = new Map<string, string>();
  sheet.walkDecls((declaration) => {
    if (declaration.prop.startsWith('--')) declarations.set(declaration.prop, declaration.value);
  });

  it('exports scheme-responsive semantic tokens and eight stable categorical colors', () => {
    for (const token of ['background', 'foreground', 'muted', 'surface', 'well', 'selection'])
      expect(declarations.get(`--${token}`)).toMatch(/^light-dark\(/u);
    expect(declarations.get('--card')).toBe('var(--surface)');
    expect(declarations.get('--border')).toBe('var(--axis)');
    for (const theme of ['light', 'dark'] as const) {
      const tokens = GENUI_APPEARANCE_TOKENS[theme];
      expect(tokens.chart).toHaveLength(8);
      expect(new Set(tokens.chart).size).toBe(8);
      expect(new Set(tokens.chart.map(hueSector)).size).toBeGreaterThanOrEqual(6);
      for (const [index, color] of tokens.chart.entries()) {
        expect(declarations.get(`--chart-${index + 1}`)).toContain(color);
        const foreground = luminance(color);
        const background = luminance(tokens.surface);
        expect(
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('separates opt-in blocks and rows without decorative edges while retaining focus and axes', () => {
    const rules = new Map<string, Map<string, string>>();
    sheet.walkRules((rule) => {
      const properties = new Map<string, string>();
      rule.walkDecls((declaration) => {
        properties.set(declaration.prop, declaration.value);
      });
      rules.set(rule.selector, properties);
    });
    expect(rules.get(':where(.genui-surface,.genui-well,.genui-selection)')?.get('border')).toBe(
      '0',
    );
    expect(
      rules.get(':where(.genui-table tr,.genui-table th,.genui-table td)')?.get('border'),
    ).toBe('0');
    expect(rules.get(':where(.genui-well)')?.get('background')).toBe('var(--well)');
    expect(rules.get(':where(.genui-selection)')?.get('background')).toBe('var(--selection)');
    expect(rules.get(':where(:focus-visible)')?.get('outline')).toBe('2px solid var(--primary)');
    expect(rules.get(':where(.genui-axis)')?.get('stroke')).toBe('var(--axis)');
    expect(GENUI_DEFAULT_CSS).not.toMatch(/!important|border(?:-bottom)?:[^;}]*solid/u);
  });

  it('keeps defaults in a low-priority layer and leaves author markup and typography intact', () => {
    expect(sheet.nodes).toHaveLength(1);
    expect(sheet.nodes[0]).toMatchObject({
      type: 'atrule',
      name: 'layer',
      params: 'genui-default',
    });
    const author =
      '<style>html{font-family:serif}body{background:var(--well)}.custom{border:3px dotted currentColor}</style><section class="custom">Authored</section>';
    for (const theme of ['light', 'dark'] as const) {
      const inner = innerDocument(theme, author);
      expect(inner).toContain(`<style>:root{color-scheme:${theme}}${GENUI_DEFAULT_CSS}</style>`);
      expect(inner).toContain('document.documentElement.style.colorScheme = message.theme');
      expect(inner).toContain(`<body>${author}</body>`);
    }
    expect(GENUI_DEFAULT_CSS).not.toMatch(/:root\s*\{[^}]*font-family/u);
  });

  it('keeps the default CSS bounded and passive, without dependencies on host or scripts', () => {
    expect(new TextEncoder().encode(GENUI_DEFAULT_CSS).length).toBeLessThan(10_000);
    expect(GENUI_DEFAULT_CSS).not.toMatch(
      /@import|url\(|<script|animation:|transition:|data-ds-dark-theme/u,
    );
    expect(GENUI_STYLE_GUIDANCE).toContain('borderless');
    expect(GENUI_STYLE_GUIDANCE).toContain('marker shapes or numbered sectors');
  });
});

describe('rich nine-scene appearance fixture', () => {
  const html = syntheticGenuiDocument.html;

  it('retains every scene, control and private-state field', () => {
    expect(parseGenuiDocument(syntheticGenuiDocument)).toEqual(syntheticGenuiDocument);
    const scenes = [...html.matchAll(/<section data-scene="([^"]+)" class="([^"]+)"/gu)];
    expect(scenes.map((scene) => scene[1])).toEqual([
      'metrics',
      'comparison',
      'table',
      'bar',
      'line',
      'donut',
      'flow',
      'relations',
      'timeline',
    ]);
    for (const scene of scenes) expect(scene[2]).toContain('genui-surface');
    for (const control of ['filter', 'sort', 'scene', 'rows', 'details', 'detail-body'])
      expect(html).toContain(`id="${control}"`);
    expect(Object.keys(syntheticGenuiDocument.stateContract!.fields)).toEqual([
      'filter',
      'sort',
      'selected',
      'scene',
      'details',
    ]);
    expect(html).toContain("input.type='radio'");
    expect(html).toContain('window.genui.setState(state)');
    expect(html).toContain('class="genui-table"');
    expect(html).not.toMatch(/#[\da-f]{3,8}\b|border(?:-bottom)?:[^;}]*solid/iu);
  });

  it('pairs categorical colors with labelled values, distinct line markers and numbered sectors', () => {
    for (const legend of ['Score legend', 'Weekly progress legend', 'Allocation legend'])
      expect(html).toContain(`aria-label="${legend}"`);
    for (const series of [1, 2, 3, 4, 5, 6]) {
      expect(html).toContain(`data-series="${series}"`);
      expect(html).toContain(`var(--chart-${series})`);
    }
    expect(html).toContain('Alpha 92');
    expect(html).toContain('Beta 74');
    expect(html).toContain('Gamma 86');
    expect(html).toContain('● ━');
    expect(html).toContain('■ ┄');
    expect(html).toContain('▲ ┈');
    expect(html).toContain('stroke-dasharray="8 4"');
    expect(html).toContain('stroke-dasharray="2 4"');
    expect(html).toContain('sector 1 research 50%, sector 2 build 30%, sector 3 review 20%');
    expect(html).toContain('class="genui-axis"');
  });
});
