import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const dsDir = fileURLToPath(new URL('../src/client/ds/', import.meta.url));
const clientDir = fileURLToPath(new URL('../src/client/', import.meta.url));
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const packagesDir = fileURLToPath(new URL('../../', import.meta.url));
const bundleDirs = ['computer', 'browser'].map((name) =>
  fileURLToPath(new URL(`../../${name}/src/client/`, import.meta.url)),
);

function stylexSources(): { name: string; source: string }[] {
  const files = [
    ...readdirSync(dsDir).map((name) => `${clientDir}ds/${name}`),
    ...readdirSync(clientDir)
      .filter((name) => /\.tsx?$/.test(name))
      .map((name) => `${clientDir}${name}`),
    ...bundleDirs.flatMap((dir) =>
      readdirSync(dir)
        .filter((name) => /\.tsx?$/.test(name))
        .map((name) => `${dir}${name}`),
    ),
  ];
  return files
    .map((path) => ({
      name: path.slice(path.indexOf('packages/')),
      source: readFileSync(path, 'utf8'),
    }))
    .filter(({ source }) => source.includes('@stylexjs/stylex'));
}

function styleBlocks(source: string): { text: string; start: number }[] {
  const blocks: { text: string; start: number }[] = [];
  let from = source.indexOf('stylex.create(');
  while (from >= 0) {
    const end = source.indexOf('\n});', from);
    const stop = end < 0 ? source.length : end;
    blocks.push({
      text: source.slice(from, stop),
      start: source.slice(0, from).split('\n').length - 1,
    });
    from = source.indexOf('stylex.create(', stop);
  }
  return blocks;
}

const STYLESHEETS: readonly { file: string; sheet: string }[] = [
  { file: 'client/src/client/styles.ts', sheet: 'CSS' },
  { file: 'client/src/client/composer-context-styles.ts', sheet: 'COMPOSER_CONTEXT_CSS' },
  { file: 'client/src/client/internal-tour-styles.ts', sheet: 'INTERNAL_TOUR_CSS' },
  { file: 'client/src/client/combobox.tsx', sheet: 'COMBOBOX_CSS' },
  { file: 'client/src/client/mobile-bot-styles.ts', sheet: 'MOBILE_BOT_CSS' },
  { file: 'client/src/client/window-companion-styles.ts', sheet: 'WINDOW_COMPANION_CSS' },
  { file: 'browser/src/client/styles.ts', sheet: 'styles' },
  { file: 'computer/src/client/index.tsx', sheet: 'ACCESS_STYLE' },
];

type Allowance = {
  name: string;
  reason: string;
  property: RegExp;
  values: readonly string[];
  selectors?: readonly string[];
};

const SPACING = /^(gap|row-gap|column-gap|padding(-[a-z]+)*|margin(-[a-z]+)*)$/;
const RADIUS = /^border(-[a-z]+)*-radius$/;

const ALLOWANCES: readonly Allowance[] = [
  {
    name: 'pill',
    reason: 'Fully rounded ends on boxes whose height varies; radius.round only suits squares.',
    property: RADIUS,
    values: ['999px'],
  },
  {
    name: 'hairline nudge',
    reason: 'One-pixel optical offsets against a 1px border sit below the 2px step.',
    property: SPACING,
    values: ['1px', '-1px'],
  },
  {
    name: 'fine corner',
    reason: 'Bars, swatches and drop lines are rounded less than the smallest control radius.',
    property: RADIUS,
    values: ['2px', '3px'],
  },
  {
    name: 'large corner',
    reason: 'Avatars, message bubbles, the composer panel and Market cards round past radius.card.',
    property: RADIUS,
    values: ['15px', '16px', '17px', '18px', '20px'],
  },
  {
    name: 'page gutter',
    reason: 'Page headers and profile sections keep their 20px rhythm, 4px from both neighbours.',
    property: SPACING,
    values: ['20px'],
  },
  {
    name: 'measured native geometry',
    reason:
      'Rows, the rename input and the composer match measured DSH geometry pinned by styles-tokens.',
    property: /^(gap|padding|border-radius)$/,
    values: ['5px', '6px', '7px', '8px', '10px', '12px', '14px', '22px', '25px', '48px'],
    selectors: [
      '.bh-section-head',
      '.bh-channel-row',
      '.bh-name-input',
      '.bh-composer',
      '.bh-composer-with-footer',
      '.bh-composer-input',
    ],
  },
  {
    name: 'icon column indent',
    reason:
      'Detail rows indent past a fixed avatar, checkbox or icon column so their text lines up.',
    property: SPACING,
    values: ['32px', '34px', '36px'],
    selectors: [
      '.bh-message-group:has(.bh-bubble-selecting)',
      '.bh-timeline-working-more',
      '.bh-workspace-folder-detail',
      '.bh-memory-commit-row',
      '.bh-channel-activity-senders',
      '.bh-card-detail',
    ],
  },
  {
    name: 'floating chrome clearance',
    reason:
      'Content keeps clear of the topbar, Activity button and composer footer that float over it.',
    property: SPACING,
    values: ['38px', '48px', '52px', '74px', '84px', '112px'],
    selectors: [
      '.bh-topbar',
      ".bh-chat-layout[data-sidebar='hidden'] .bh-topbar",
      '.bh-chat-body',
      '.bh-composer-expanded',
      '.bh-panel-activity',
      "nav:has(> .bh-panel-activity[data-wide='true']) > button:has(.bh-panel-glyph)",
    ],
  },
  {
    name: 'banner overlap',
    reason: 'Welcome, profile and Market avatars lift onto the banner above by part of their size.',
    property: /^margin-top$/,
    values: ['-32px', '-36px', '-40px', '-42px'],
    selectors: [
      '.bh-welcome-identity',
      '.bh-market-row-head',
      '.bh-market-hero > .bh-market-row-head',
      '.bh-profile-header-top',
    ],
  },
  {
    name: 'badge type',
    reason: 'Counter digits and upload status glyphs fit badges smaller than the 12/16 meta line.',
    property: /^(font-size|line-height)$/,
    values: ['9px', '13px'],
    selectors: [
      '.bh-avatar-facepile-overflow',
      '.bh-group-attention-badge',
      '.bh-composer-upload-status',
      '.bh-composer-upload-retry',
    ],
  },
  {
    name: 'page heading',
    reason:
      'The full-page Inbox, Activity title and empty states keep the native page heading scale.',
    property: /^(padding|font-size)$/,
    values: ['6px', '24px', '28px', '64px'],
    selectors: [
      '.bh-human-inbox',
      '.bh-human-inbox h1',
      '.bh-activity-center-header h1',
      '.bh-hidden-empty',
    ],
  },
];

function maskSheet(source: string, sheet: string): string {
  const at = source.search(new RegExp(`const ${sheet}\\b[^=]*=`));
  if (at < 0) throw new Error(`missing stylesheet ${sheet}`);
  const mask: string[] = Array.from(source, (char) => (char === '\n' ? '\n' : ' '));
  let inTemplate = false;
  for (let index = source.indexOf('=', at) + 1; index < source.length; index++) {
    const char = source[index]!;
    if (!inTemplate) {
      if (char === '`') inTemplate = true;
      else if (char === ';') break;
      continue;
    }
    if (char === '`') {
      inTemplate = false;
      continue;
    }
    if (char === '$' && source[index + 1] === '{') {
      const close = source.indexOf('}', index);
      for (let fill = index; fill <= close; fill++) mask[fill] = '@';
      index = close;
      continue;
    }
    mask[index] = char;
  }
  return mask.join('').replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
}

type Declaration = { selector: string; property: string; value: string; line: number };

function declarations(text: string): Declaration[] {
  const found: Declaration[] = [];
  const stack: string[] = [];
  let from = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '{') {
      stack.push(text.slice(from, index).replace(/@+/g, '').replace(/\s+/g, ' ').trim());
      from = index + 1;
    } else if (char === ';' || char === '}') {
      const selector = stack.at(-1);
      const match = /^\s*([-a-z]+)\s*:\s*([\s\S]*?)\s*$/.exec(text.slice(from, index));
      if (selector !== undefined && !selector.startsWith('@') && match)
        found.push({
          selector,
          property: match[1]!,
          value: match[2]!,
          line: text.slice(0, from).split('\n').length,
        });
      if (char === '}') stack.pop();
      from = index + 1;
    }
  }
  return found;
}

const SCALED_PROPERTY =
  /^(gap|row-gap|column-gap|padding(-[a-z]+)*|margin(-[a-z]+)*|font|font-size|line-height|font-weight|border(-[a-z]+)*-radius|--bh-chat-card-inset|--bh-message-card-gap)$/;

function literals({ property, value }: Declaration): string[] {
  if (!SCALED_PROPERTY.test(property)) return [];
  const lengths = [...value.matchAll(/-?\d*\.?\d+px\b/g)]
    .map((match) => match[0])
    .filter((length) => Number.parseFloat(length) !== 0);
  const weights = /^(font|font-weight)$/.test(property)
    ? [...value.matchAll(/(?<![\w.-])[1-9]00(?![\w.])/g)].map((match) => match[0])
    : [];
  return [...lengths, ...weights];
}

function allowed(declaration: Declaration, values: readonly string[]): boolean {
  return values.every((value) =>
    ALLOWANCES.some(
      (allowance) =>
        allowance.property.test(declaration.property) &&
        allowance.values.includes(value) &&
        (!allowance.selectors || allowance.selectors.includes(declaration.selector)),
    ),
  );
}

function sheetOffenders(): string[] {
  return STYLESHEETS.flatMap(({ file, sheet }) => {
    const source = readFileSync(packagesDir + file, 'utf8');
    const text = maskSheet(source, sheet);
    const colours = text
      .split('\n')
      .flatMap((line, index) =>
        LITERAL_COLOUR.test(line) ? [`${file}:${index + 1} colour ${line.trim()}`] : [],
      );
    const parsed = declarations(text);
    if (parsed.length === 0) throw new Error(`no declarations parsed from ${file}`);
    const lengths = parsed.flatMap((declaration) => {
      const values = literals(declaration);
      return values.length && !allowed(declaration, values)
        ? [
            `${file}:${declaration.line} ${declaration.selector} { ${declaration.property}: ${declaration.value} }`,
          ]
        : [];
    });
    return [...colours, ...lengths];
  });
}

const SCALED =
  /\b(fontSize|lineHeight|fontWeight|gap|rowGap|columnGap|padding\w*|margin\w*|borderRadius)\s*:\s*(['"])(?!0\2)/;

describe('design-system tokens', () => {
  it('keeps every StyleX colour on a DSH token', () => {
    const tokens = readFileSync(`${dsDir}tokens.stylex.ts`, 'utf8');
    const colours = tokens.slice(tokens.indexOf('export const color'));
    for (const value of colours.matchAll(/:\s*'([^']+)'/g))
      expect(value[1]).toMatch(/^var\(--dsw-[a-z0-9-]+\)$/);
  });

  it('guards the Computer and Browser bundle StyleX sources too', () => {
    expect(stylexSources().map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'packages/computer/src/client/settings-rows.tsx',
        'packages/computer/src/client/local-computer.tsx',
      ]),
    );
  });

  it('authors spacing, type and radius only through tokens', () => {
    const offenders = stylexSources()
      .filter(({ name }) => !name.endsWith('/ds/tokens.stylex.ts'))
      .flatMap(({ name, source }) =>
        styleBlocks(source).flatMap(({ text, start }) =>
          text
            .split('\n')
            .map((line, index) => ({ line, index }))
            .filter(({ line }) => SCALED.test(line) || LITERAL_COLOUR.test(line))
            .map(({ line, index }) => `${name}:${start + index + 1} ${line.trim()}`),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it('keeps every plugin stylesheet on the token scale', () => {
    expect(sheetOffenders()).toEqual([]);
  });

  it('keeps the stylesheet allowlist small and explained', () => {
    expect(ALLOWANCES.length).toBeLessThanOrEqual(12);
    for (const allowance of ALLOWANCES) expect(allowance.reason.length).toBeGreaterThan(20);
  });

  it('keeps tokens in the scale the Channel sidebar uses', () => {
    const tokens = readFileSync(`${dsDir}tokens.stylex.ts`, 'utf8');
    const block = (name: string) =>
      tokens.slice(tokens.indexOf(`export const ${name}`)).split('});')[0]!;
    const px = (name: string) =>
      [...block(name).matchAll(/'(\d+)px'/g)].map((match) => Number(match[1]));
    expect(px('space')).toEqual([2, 4, 8, 12, 16, 24]);
    expect(px('radius')).toEqual([6, 8, 10]);
    expect(px('size')).toEqual([26, 28, 32, 40]);
    const widths = [...block('dialog').matchAll(/min\((\d+)px/g)].map((match) => Number(match[1]));
    expect(widths).toEqual([440, 760, 1060]);
  });
});
