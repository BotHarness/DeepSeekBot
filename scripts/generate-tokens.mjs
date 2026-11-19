#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
export const RESOLVER = fileURLToPath(new URL('design/tokens/tobs.resolver.json', root));
export const CSS_OUTPUT = fileURLToPath(
  new URL('packages/client/src/client/ds/tobs-tokens.generated.ts', root),
);
export const STYLEX_OUTPUT = fileURLToPath(
  new URL('packages/client/src/client/ds/tobs.stylex.ts', root),
);

export const MOBILE_OUTPUT = fileURLToPath(
  new URL('packages/host-client/src/ui/design/palette.generated.ts', root),
);

const isToken = (node) => node !== null && typeof node === 'object' && '$value' in node;

function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('$')) continue;
    if (isToken(value) || !(key in target) || isToken(target[key])) {
      target[key] = structuredClone(value);
      continue;
    }
    merge(target[key], value);
  }
  return target;
}

export function readResolver(path = RESOLVER) {
  const resolver = JSON.parse(readFileSync(path, 'utf8'));
  const base = dirname(path);
  const load = (source) =>
    typeof source.$ref === 'string' && !source.$ref.startsWith('#')
      ? JSON.parse(readFileSync(join(base, source.$ref), 'utf8'))
      : source;
  const pointer = (ref) => {
    const [, kind, name] = /^#\/(sets|modifiers)\/(.+)$/.exec(ref) ?? [];
    if (!kind) throw new Error(`Unsupported resolver reference ${ref}`);
    return { kind, name };
  };
  const order = resolver.resolutionOrder.map((entry) => pointer(entry.$ref));
  const sets = Object.fromEntries(
    Object.entries(resolver.sets).map(([name, set]) => [name, set.sources.map(load)]),
  );
  const modifiers = Object.fromEntries(
    Object.entries(resolver.modifiers).map(([name, modifier]) => [
      name,
      {
        default: modifier.default,
        contexts: Object.fromEntries(
          Object.entries(modifier.contexts).map(([context, sources]) => [
            context,
            sources.map(load),
          ]),
        ),
      },
    ]),
  );
  return { order, sets, modifiers };
}

export function resolveTree(input, resolver = readResolver()) {
  const tree = {};
  for (const { kind, name } of resolver.order) {
    if (kind === 'sets') {
      for (const source of resolver.sets[name]) merge(tree, source);
      continue;
    }
    const modifier = resolver.modifiers[name];
    const context = input[name] ?? modifier.default;
    const sources = modifier.contexts[context];
    if (!sources) throw new Error(`Unknown ${name} context ${context}`);
    for (const source of sources) merge(tree, source);
  }
  return tree;
}

const hex2 = (n) =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0');

function colorCss(value) {
  if (typeof value === 'string') return value;
  const hex = value.hex ?? `#${value.components.map((c) => hex2(c * 255)).join('')}`;
  return value.alpha === undefined || value.alpha === 1 ? hex : `${hex}${hex2(value.alpha * 255)}`;
}

const dimensionCss = (value) => (typeof value === 'string' ? value : `${value.value}${value.unit}`);
const offsetCss = (value) => (value.value === 0 ? '0' : dimensionCss(value));

function shadowCss(value) {
  return (Array.isArray(value) ? value : [value])
    .map((layer) =>
      [
        layer.inset ? 'inset' : '',
        offsetCss(layer.offsetX),
        offsetCss(layer.offsetY),
        offsetCss(layer.blur),
        layer.spread && layer.spread.value !== 0 ? offsetCss(layer.spread) : '',
        colorCss(layer.color),
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join(', ');
}

const fontFamilyCss = (value) =>
  (Array.isArray(value) ? value : [value])
    .map((name) => (/\s/.test(name) ? `'${name}'` : name))
    .join(', ');

function css(type, value) {
  if (type === 'color') return colorCss(value);
  if (type === 'dimension' || type === 'duration') return dimensionCss(value);
  if (type === 'shadow') return shadowCss(value);
  if (type === 'fontFamily') return fontFamilyCss(value);
  return value;
}

function leavesOf(tree) {
  const leaves = new Map();
  const walk = (node, path) => {
    if (isToken(node)) {
      leaves.set(path.join('.'), { path, type: node.$type, raw: node.$value });
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (!key.startsWith('$')) walk(child, [...path, key]);
    }
  };
  walk(tree, []);
  return leaves;
}

const aliasOf = (raw) =>
  typeof raw === 'string' ? (/^\{([^}]+)\}$/.exec(raw)?.[1] ?? undefined) : undefined;

function resolver(leaves) {
  const resolve = (key, seen = new Set()) => {
    const leaf = leaves.get(key);
    if (!leaf) throw new Error(`Unknown token alias {${key}}`);
    if (seen.has(key)) throw new Error(`Cyclic token alias {${key}}`);
    const target = aliasOf(leaf.raw);
    if (target) return resolve(target, new Set([...seen, key]));
    return css(leaf.type, leaf.raw);
  };
  return resolve;
}

const parse = (hex) => {
  let digits = hex.slice(1);
  if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('');
  const channel = (at) => Number.parseInt(digits.slice(at, at + 2), 16);
  return [channel(0), channel(2), channel(4), digits.length === 8 ? channel(6) / 255 : 1];
};
const toHex = (rgb) => `#${rgb.map(hex2).join('')}`;
const toLinear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklch(hex) {
  const [r, g, b] = parse(hex).slice(0, 3).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function fromOklch([L, C, h]) {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function atLightness(hex, L) {
  const [, C, h] = toOklch(hex);
  let lo = 0;
  let hi = C;
  const inGamut = (c) => fromOklch([L, c, h]).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  if (inGamut(C)) lo = C;
  else
    for (let step = 0; step < 24; step += 1) {
      const mid = (lo + hi) / 2;
      if (inGamut(mid)) lo = mid;
      else hi = mid;
    }
  return toHex(fromOklch([L, lo, h]).map(fromLinear));
}

function reach(hex, backgrounds, minimum, darker) {
  const passes = (candidate) => backgrounds.every((bg) => contrast(candidate, bg) >= minimum);
  if (passes(hex)) return hex;
  let near = toOklch(hex)[0];
  let far = darker ? 0 : 1;
  for (let step = 0; step < 32; step += 1) {
    const mid = (near + far) / 2;
    if (passes(atLightness(hex, mid))) far = mid;
    else near = mid;
  }
  return atLightness(hex, far);
}

export function mix(top, under, amount) {
  const a = parse(top);
  const b = parse(under);
  return toHex([0, 1, 2].map((i) => a[i] * amount + b[i] * (1 - amount)));
}

export const ACCENT_ROLES = [
  'solid',
  'solid-hover',
  'on-solid',
  'container',
  'on-container',
  'tint',
  'ink',
  'focus',
  'selection',
  'on-selection',
];

const ON_SOLID = { light: '#ffffff', dark: '#0d1220' };
const SURFACES = ['canvas', 'raised', 'well', 'field', 'nav', 'sheet', 'elevated'];

export function accentRoles(seed, mode, layers) {
  const light = mode === 'light';
  const surfaces = SURFACES.map((name) => layers[name]);
  const onSolid = ON_SOLID[mode];
  const solid = reach(reach(seed, [onSolid], 4.5, light), surfaces, 3, light);
  const solidHover = atLightness(solid, toOklch(solid)[0] + (light ? -0.06 : 0.06));
  const tint = mix(solid, layers.canvas, light ? 0.1 : 0.18);
  const container = mix(solid, layers.canvas, light ? 0.18 : 0.3);
  const selection = reach(seed, ['#ffffff'], 4.5, true);
  return {
    solid,
    'solid-hover': solidHover,
    'on-solid': onSolid,
    container,
    'on-container': reach(seed, [container], 4.5, light),
    tint,
    ink: reach(seed, [...surfaces, tint, layers.selected], 4.5, light),
    focus: reach(seed, surfaces, 3, light),
    selection,
    'on-selection': '#ffffff',
  };
}

export function cssName(path) {
  const rest = path[0] === 'web' ? path.slice(1) : path;
  return `--tobs-${(rest[0] === 'color' ? rest.slice(1) : rest).join('-')}`;
}

const SCHEMED = new Set(['color', 'shadow']);

export function resolveTokens(input = {}, source = readResolver()) {
  const leaves = leavesOf(resolveTree(input, source));
  const resolve = resolver(leaves);
  const mode = input.mode ?? source.modifiers.mode.default;
  const layers = {
    ...Object.fromEntries(SURFACES.map((name) => [name, resolve(`web.color.layer.${name}`)])),
    selected: resolve('web.color.state.selected'),
  };
  const roles = accentRoles(resolve('web.color.accent.seed'), mode, layers);
  leaves.delete('web.color.accent.seed');
  for (const role of ACCENT_ROLES)
    leaves.set(`web.color.accent.${role}`, {
      path: ['web', 'color', 'accent', role],
      type: 'color',
      raw: roles[role],
    });
  return [...leaves.values()].map((leaf) => ({
    ...leaf,
    alias: aliasOf(leaf.raw),
    value: resolve(leaf.path.join('.')),
  }));
}

const contexts = (source, name) => Object.keys(source.modifiers[name].contexts);

export function webTokens(source = readResolver()) {
  const modes = contexts(source, 'mode');
  const accents = contexts(source, 'accent');
  const styles = contexts(source, 'style');
  const defaults = Object.fromEntries(
    Object.entries(source.modifiers).map(([name, modifier]) => [name, modifier.default]),
  );
  const isVar = (leaf) =>
    leaf.path[0] === 'web' && leaf.path[1] !== 'style' && SCHEMED.has(leaf.type);
  const scheme = (mode, accent = defaults.accent) =>
    Object.fromEntries(
      resolveTokens({ ...defaults, mode, accent }, source)
        .filter(isVar)
        .map((leaf) => [cssName(leaf.path), leaf.value]),
    );
  const schemes = Object.fromEntries(modes.map((mode) => [mode, scheme(mode)]));
  const byAccent = Object.fromEntries(
    accents.map((accent) => [
      accent,
      Object.fromEntries(modes.map((mode) => [mode, scheme(mode, accent)])),
    ]),
  );
  const accentVars = Object.keys(schemes[defaults.mode]).filter((name) =>
    accents.some((accent) =>
      modes.some((mode) => byAccent[accent][mode][name] !== schemes[mode][name]),
    ),
  );
  const accentSets = Object.fromEntries(
    accents.map((accent) => [
      accent,
      Object.fromEntries(
        modes.map((mode) => [
          mode,
          Object.fromEntries(accentVars.map((name) => [name, byAccent[accent][mode][name]])),
        ]),
      ),
    ]),
  );
  const seeds = Object.fromEntries(
    accents.map((accent) => [
      accent,
      Object.fromEntries(
        modes.map((mode) => [
          mode,
          resolveTokens({ ...defaults, mode }, source).find(
            (leaf) => leaf.path.join('.') === `palette.accent.${accent}`,
          ).value,
        ]),
      ),
    ]),
  );
  const leaves = resolveTokens(defaults, source);
  const varOf = new Map(
    leaves.filter(isVar).map((leaf) => [leaf.path.join('.'), cssName(leaf.path)]),
  );
  const styleSets = Object.fromEntries(
    styles.map((style) => [
      style,
      Object.fromEntries(
        resolveTokens({ ...defaults, style }, source)
          .filter((leaf) => leaf.path[0] === 'web' && leaf.path[1] === 'style')
          .map((leaf) => [
            cssName(leaf.path),
            leaf.alias && varOf.has(leaf.alias) ? `var(${varOf.get(leaf.alias)})` : leaf.value,
          ]),
      ),
    ]),
  );
  const breakpoints = Object.fromEntries(
    leaves
      .filter((leaf) => leaf.path[0] === 'core' && leaf.path[1] === 'breakpoint')
      .map((leaf) => [leaf.path[2], leaf.value]),
  );
  return {
    leaves: leaves.filter((leaf) => leaf.path[0] === 'web'),
    defaults,
    schemes,
    accents: seeds,
    accentSets,
    styles: styleSets,
    breakpoints,
  };
}

function mobileScheme(mode, resolve) {
  const light = mode === 'light';
  const neutral = (lightTone, darkTone) =>
    resolve(`palette.neutral.${light ? lightTone : darkTone}`);
  const base = neutral(100, 11);
  const surface = neutral(97, 15);
  const field = neutral(100, 9);
  const sheet = neutral(100, 13);
  const elevated = neutral(100, 20);
  const surfaces = [base, surface, field, sheet, elevated];
  const backdrop = neutral(0, 100);
  const alpha = (color, opacity) => `${color}${hex2(opacity * 255)}`;
  const dangerous = resolve('palette.status.red');
  const amber = resolve('palette.status.amber');
  const dangerTint = mix(dangerous, surface, light ? 0.18 : 0.26);
  const warningSoft = mix(amber, base, light ? 0.12 : 0.14);
  const statusInk = (seed, extra = []) => reach(seed, [...surfaces, ...extra], 4.5, light);
  const onSolid = neutral(100, 7);
  const danger = reach(statusInk(dangerous, [dangerTint]), [onSolid], 4.5, light);
  const warning = reach(
    reach(amber, [...surfaces, warningSoft], 4.6, light),
    [onSolid],
    4.5,
    light,
  );
  const edge = reach(base, surfaces, 3, light);

  return {
    fg: neutral(7, 96),
    muted: neutral(38, 68),
    subtle: neutral(42, 61),
    divider: alpha(backdrop, light ? 0.07 : 0.06),
    border: alpha(backdrop, light ? 0.11 : 0.12),
    borderStrong: edge,
    borderField: edge,
    hover: alpha(backdrop, light ? 0.06 : 0.08),
    selected: alpha(backdrop, light ? 0.11 : 0.14),
    danger,
    onDanger: onSolid,
    dangerEdge: reach(dangerous, surfaces, 3, light),
    dangerSoft: alpha(dangerous, light ? 0.09 : 0.14),
    warning,
    onWarning: onSolid,
    warningEdge: reach(amber, surfaces, 3, light),
    warningSoft,
    success: statusInk(resolve('palette.status.green')),
    surface,
    field,
    sheet,
    modal: sheet,
    elevated,
    base,
    well: base,
    scrim: alpha(neutral(7, 0), light ? 0.4 : 0.6),
  };
}

export function mobileTokens(source = readResolver()) {
  const accents = contexts(source, 'accent');
  const modes = contexts(source, 'mode').map((mode) => {
    const resolve = resolver(leavesOf(resolveTree({ mode }, source)));
    const scheme = mobileScheme(mode, resolve);
    const light = mode === 'light';
    const surfaces = [scheme.base, scheme.surface, scheme.field, scheme.sheet, scheme.elevated];
    const onAccent = resolve(`palette.neutral.${light ? 100 : 7}`);
    const accentRoles = (seed) => {
      const accent = reach(reach(seed, [onAccent], 4.5, light), surfaces, 4.5, light);
      const accentTint = mix(accent, scheme.base, light ? 0.13 : 0.3);
      return {
        accent,
        accentText: reach(seed, [...surfaces, accentTint], 4.5, light),
        accentTint,
        onAccent,
      };
    };
    return {
      mode,
      palette: { ...scheme, ...accentRoles(resolve('palette.brand')) },
      accents: Object.fromEntries(
        accents.map((accent) => [accent, accentRoles(resolve(`palette.accent.${accent}`))]),
      ),
    };
  });
  return {
    palette: Object.fromEntries(modes.map(({ mode, palette }) => [mode, palette])),
    accents: Object.fromEntries(modes.map(({ mode, accents }) => [mode, accents])),
  };
}

const camel = (parts) =>
  parts
    .join('-')
    .replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
    .replace(/^(\d)/, 'x$1');

const literal = (value) =>
  Array.isArray(value)
    ? `'cubic-bezier(${value.join(', ')})'`
    : typeof value === 'number'
      ? `'${value}'`
      : String(value).includes("'")
        ? `"${value}"`
        : `'${value}'`;

const key = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`);

const record = (values, indent) =>
  Object.entries(values)
    .map(([name, value]) => `${indent}${key(name)}: ${literal(value)},`)
    .join('\n');

const nested = (values, depth, leaf) =>
  Object.entries(values)
    .map(
      ([name, value]) =>
        `${'  '.repeat(depth)}${key(name)}: {\n${leaf(value, depth + 1)}\n${'  '.repeat(depth)}},`,
    )
    .join('\n');

export function renderCss(tokens = webTokens()) {
  const breakpoints = Object.entries(tokens.breakpoints)
    .map(([name, value]) => `  ${camel([name])}: ${literal(value)},`)
    .join('\n');
  const accents = Object.entries(tokens.accents)
    .map(
      ([name, { light, dark }]) =>
        `  '${name}': { light: ${literal(light)}, dark: ${literal(dark)} },`,
    )
    .join('\n');
  return `export const TOBS_TOKENS = {
${nested(tokens.schemes, 1, (values, depth) => record(values, '  '.repeat(depth)))}
} as const;

export const TOBS_ACCENTS = {
${accents}
} as const;

export const TOBS_ACCENT_ROLES = {
${nested(tokens.accentSets, 1, (modes, depth) =>
  nested(modes, depth, (values, inner) => record(values, '  '.repeat(inner))),
)}
} as const;

export const TOBS_STYLES = {
${nested(tokens.styles, 1, (values, depth) => record(values, '  '.repeat(depth)))}
} as const;

export const TOBS_BREAKPOINTS = {
${breakpoints}
} as const;
`;
}

export function renderMobile(tokens = mobileTokens()) {
  return `export const palette = {
${nested(tokens.palette, 1, (values, depth) => record(values, '  '.repeat(depth)))}
} as const;

export const mobileAccents = {
${nested(tokens.accents, 1, (accents, depth) =>
  nested(accents, depth, (values, inner) => record(values, '  '.repeat(inner))),
)}
} as const;
`;
}

export function renderStylex(tokens = webTokens()) {
  const groups = new Map();
  for (const leaf of tokens.leaves) {
    const [, group, ...rest] = leaf.path;
    const key = group === 'color' ? rest[0] : group;
    const name = camel(group === 'color' ? rest.slice(1) : rest);
    const value =
      group === 'style' || SCHEMED.has(leaf.type) ? `var(${cssName(leaf.path)})` : leaf.value;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(`  ${name}: ${literal(value)},`);
  }
  const blocks = [...groups]
    .map(
      ([group, lines]) => `export const ${camel([group])} = stylex.defineConsts({
${lines.join('\n')}
});`,
    )
    .join('\n\n');
  return `import * as stylex from '@stylexjs/stylex';

${blocks}
`;
}

export function contrast(foreground, background, backdrop = '#ffffff') {
  const over = (top, under) => {
    const [r, g, b, a] = parse(top);
    const [ur, ug, ub] = under;
    return [r * a + ur * (1 - a), g * a + ug * (1 - a), b * a + ub * (1 - a)];
  };
  const base = over(backdrop, [255, 255, 255]);
  const bg = over(background, base);
  const fg = over(foreground, bg);
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = readResolver();
  const web = webTokens(source);
  const outputs = [
    [CSS_OUTPUT, renderCss(web)],
    [STYLEX_OUTPUT, renderStylex(web)],
    [MOBILE_OUTPUT, renderMobile(mobileTokens(source))],
  ];
  const check = process.argv.includes('--check');
  let stale = false;
  for (const [path, next] of outputs) {
    if (!check) {
      writeFileSync(path, next);
      continue;
    }
    let current = '';
    try {
      current = readFileSync(path, 'utf8');
    } catch {}
    if (current !== next) {
      stale = true;
      console.error(`${path} is stale; run node scripts/generate-tokens.mjs`);
    }
  }
  if (stale) process.exit(1);
  if (check) console.log('Tobs design token outputs are current.');
}
