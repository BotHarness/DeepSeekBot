import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parse as parseAstro } from '@astrojs/compiler';
import { parse as parseJavaScript } from '@babel/parser';
import postcss from 'postcss';
import { findReactEffects } from './react-effect-policy.mjs';

const codeExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);
const sourceExtensions = new Set([...codeExtensions, '.astro', '.css']);
const generatedPrefixes = [
  'packages/computer/lib/',
  'packages/browser/lib/',
  'apps/docs/dist/',
  'apps/docs/.astro/',
];
const licenseHeaderHashes = new Map([
  ['packages/browser/src/client/access-power-icon.tsx', '47c84c1a9f26559a'],
  ['packages/computer/src/client/access-power-icon.tsx', '47c84c1a9f26559a'],
  ['packages/client/src/client/channel-sidebar-icon.tsx', '473ded718879faec'],
  ['packages/client/src/client/hash-icon.tsx', '8d64b9069cfcfaab'],
  ['packages/client/src/client/git-commit-icon.tsx', 'f12f09c727a3d8d5'],
  ['packages/client/src/client/inbox-icon.tsx', '8412a9519ce369b7'],
]);
const firstPartyPrefixes = ['packages/', 'scripts/', 'apps/docs/', 'apps/mobile/', 'design/'];

export function isPolicySource(path) {
  const normalized = path.replaceAll('\\', '/');
  if (!sourceExtensions.has(extname(normalized))) return false;
  if (generatedPrefixes.some((prefix) => normalized.startsWith(prefix))) return false;
  if (normalized.endsWith('.min.js') || normalized.endsWith('.map')) return false;
  return (
    firstPartyPrefixes.some((prefix) => normalized.startsWith(prefix)) || !normalized.includes('/')
  );
}

function position(source, offset) {
  const lines = source.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function issue(path, source, kind, offset, token) {
  const { line, column } = position(source, offset);
  const normalizedToken = token.replace(/\r\n/g, '\n');
  return {
    path,
    kind,
    line,
    column,
    token: normalizedToken,
    hash: createHash('sha256').update(`${kind}\0${normalizedToken}`).digest('hex').slice(0, 16),
  };
}

function isException(path, item) {
  if (item.kind !== 'comment') return false;
  if (item.token === '#!/usr/bin/env node' && item.line === 1 && path.startsWith('scripts/'))
    return true;
  if (
    item.token === '// @vitest-environment jsdom' &&
    item.line === 1 &&
    /(?:^|\/)test\/[^/]+\.test\.[jt]sx?$/.test(path)
  )
    return true;
  if (
    path === 'apps/docs/src/components/ui/search/providers/pagefind.ts' &&
    item.token === '/* @vite-ignore */'
  )
    return true;
  if (item.line === 1 && item.column === 1 && item.hash === licenseHeaderHashes.get(path))
    return true;
  return false;
}

function scanScript(path, fragment, source, baseOffset) {
  const plugins = /\.[mc]?ts$/.test(path)
    ? ['typescript', 'decorators-legacy']
    : ['typescript', 'jsx', 'decorators-legacy'];
  const parsed = parseJavaScript(fragment, {
    sourceType: 'unambiguous',
    plugins,
    allowReturnOutsideFunction: true,
    errorRecovery: true,
  });
  const found = [];
  for (const comment of parsed.comments) {
    found.push(
      issue(
        path,
        source,
        'comment',
        baseOffset + comment.start,
        fragment.slice(comment.start, comment.end),
      ),
    );
  }
  for (const call of findReactEffects(parsed)) {
    found.push(
      issue(
        path,
        source,
        'useEffect',
        baseOffset + call.start,
        fragment.slice(call.start, call.end),
      ),
    );
  }
  if (fragment.startsWith('#!')) {
    found.push(
      issue(path, source, 'comment', baseOffset, fragment.split('\n', 1)[0].replace(/\r$/, '')),
    );
  }
  return found;
}
function scanCss(path, fragment, source, baseOffset) {
  const found = [];
  const root = postcss.parse(fragment, { from: path });
  root.walkComments((node) => {
    const start = node.source.start.offset;
    found.push(
      issue(
        path,
        source,
        'comment',
        baseOffset + start,
        fragment.slice(start, node.source.end.offset),
      ),
    );
  });
  return found;
}

function utf16Offset(source, byteOffset) {
  return Buffer.from(source).subarray(0, byteOffset).toString().length;
}

async function scanAstro(path, source) {
  const { ast } = await parseAstro(source, { position: true });
  const found = [];
  function offsetOf(node) {
    return utf16Offset(source, node.position.start.offset);
  }
  function visit(node) {
    if (node.type === 'comment') {
      const offset = offsetOf(node) - 4;
      found.push(
        issue(
          path,
          source,
          'comment',
          offset,
          source.slice(offset, offset + node.value.length + 7),
        ),
      );
    } else if (node.type === 'frontmatter') {
      const start = source.indexOf(node.value, offsetOf(node));
      found.push(...scanScript(path, node.value, source, start));
    } else if (node.type === 'expression') {
      const start = offsetOf(node);
      const end = node.position.end ? utf16Offset(source, node.position.end.offset) : start;
      if (source[start] === '{' && source[end - 1] === '}') {
        found.push(...scanScript(path, source.slice(start + 1, end - 1), source, start + 1));
      }
    } else if (node.type === 'element' && (node.name === 'script' || node.name === 'style')) {
      for (const child of node.children) {
        if (child.type !== 'text') continue;
        const start = offsetOf(child);
        found.push(
          ...(node.name === 'style'
            ? scanCss(path, child.value, source, start)
            : scanScript(path, child.value, source, start)),
        );
      }
    } else if (node.children) {
      for (const child of node.children) visit(child);
    }
    if (node.attributes) {
      for (const attribute of node.attributes) {
        if (attribute.kind !== 'expression' && attribute.kind !== 'template-literal') continue;
        const start = source.indexOf(attribute.value, offsetOf(attribute));
        found.push(...scanScript(path, attribute.value, source, start));
      }
    }
  }
  visit(ast);
  return found;
}

export async function scanSource(path, source) {
  if (!isPolicySource(path)) return [];
  const normalized = path.replaceAll('\\', '/');
  const extension = extname(normalized);
  const found =
    extension === '.astro'
      ? await scanAstro(normalized, source)
      : extension === '.css'
        ? scanCss(normalized, source, source, 0)
        : scanScript(normalized, source, source, 0);
  const unique = new Map();
  for (const item of found) {
    if (!isException(normalized, item)) {
      unique.set(`${item.kind}:${item.line}:${item.column}:${item.hash}`, item);
    }
  }
  return [...unique.values()].sort((a, b) => a.line - b.line || a.column - b.column);
}

export async function scanRepository(root) {
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root },
  )
    .toString('utf8')
    .split('\0')
    .filter(isPolicySource);
  const found = [];
  for (const path of paths)
    found.push(...(await scanSource(path, readFileSync(join(root, path), 'utf8'))));
  return found;
}
