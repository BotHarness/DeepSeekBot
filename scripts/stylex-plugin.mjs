import { transformAsync } from '@babel/core';
import syntaxJsx from '@babel/plugin-syntax-jsx';
import syntaxTypescript from '@babel/plugin-syntax-typescript';
import stylexBabel from '@stylexjs/babel-plugin';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

export const STYLEX_CSS_PLACEHOLDER = '@bh-stylex-css';

const SOURCE = /\.[cm]?[jt]sx?$/;

function canonicalFilePath(file, rootDir) {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      const { name } = JSON.parse(readFileSync(manifest, 'utf8'));
      return `${name}:${relative(dir, file).replaceAll('\\', '/')}`;
    }
    if (dirname(dir) === dir) return relative(rootDir, file).replaceAll('\\', '/');
  }
}

function resolveStylexFile(specifier, importer) {
  const require = createRequire(importer);
  const base = specifier.replace(/\.(?:[cm]?js|tsx?|jsx)$/, '');
  for (const candidate of [
    specifier,
    ...['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'].map((suffix) => `${base}${suffix}`),
  ]) {
    try {
      return require.resolve(candidate);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  return null;
}

export function stylexOptions(rootDir) {
  return {
    dev: false,
    test: false,
    runtimeInjection: false,
    classNamePrefix: 'bhx',
    styleResolution: 'property-specificity',
    treeshakeCompensation: true,
    unstable_moduleResolution: {
      type: 'custom',
      getCanonicalFilePath: (file) => canonicalFilePath(file, rootDir),
      filePathResolver: resolveStylexFile,
    },
  };
}

const PRIORITY_LEVEL = 1000;

function priorityAnchors(rules) {
  const top = Math.max(-1, ...rules.map(([, , priority]) => Math.floor(priority / PRIORITY_LEVEL)));
  return Array.from({ length: top + 1 }, (_, level) => [
    `bhx-level-${String(level)}`,
    { ltr: `.bhx-level-${String(level)}{}`, rtl: null },
    level * PRIORITY_LEVEL,
  ]);
}

export function stylexCss(rules) {
  if (rules.length === 0) return '';
  return stylexBabel.processStylexRules([...priorityAnchors(rules), ...rules], {
    useLayers: false,
  });
}

export function stylexPlugin({ rootDir }) {
  const rulesById = new Map();
  return {
    name: 'botharness:stylex',
    enforce: 'pre',
    async transform(code, id) {
      const file = id.split('?')[0];
      if (!SOURCE.test(file) || file.includes('/node_modules/')) return null;
      if (!code.includes('@stylexjs/stylex')) {
        rulesById.delete(file);
        return null;
      }
      const result = await transformAsync(code, {
        filename: file,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        parserOpts: { sourceType: 'module' },
        plugins: [
          [syntaxTypescript, { isTSX: file.endsWith('x') }],
          ...(file.endsWith('x') ? [syntaxJsx] : []),
          stylexBabel.withOptions(stylexOptions(rootDir)),
        ],
      });
      const rules = result?.metadata?.stylex ?? [];
      if (rules.length) rulesById.set(file, rules);
      else rulesById.delete(file);
      return { code: result?.code ?? code, map: result?.map ?? null };
    },
    renderChunk(code) {
      const at = code.indexOf(STYLEX_CSS_PLACEHOLDER);
      if (at < 0) return null;
      const css = `\n${stylexCss([...rulesById.values()].flat())}\n`;
      const quote = code[at - 1];
      const end = at + STYLEX_CSS_PLACEHOLDER.length;
      const literal = (quote === '"' || quote === "'") && code[end] === quote;
      const replacement = literal
        ? JSON.stringify(css)
        : css.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
      const from = literal ? at - 1 : at;
      const to = literal ? end + 1 : end;
      return { code: code.slice(0, from) + replacement + code.slice(to), map: null };
    },
  };
}
