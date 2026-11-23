import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const PLATFORM_FILE = /^(.+)\.(?:ios|android|native|web)\.[jt]sx?$/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return PLATFORM_FILE.test(name) ? [path] : [];
  });
}

function runtimeSelfImports(file: string, source: string): string[] {
  const base = PLATFORM_FILE.exec(basename(file))?.[1];
  if (base === undefined) return [];
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const statement = new RegExp(
    `import\\s+(?!type\\s)([^'";]*?)\\s+from\\s+['"]\\./${escaped}['"]`,
    'g',
  );
  const found: string[] = [];
  for (const match of source.matchAll(statement)) {
    const clause = match[1]!;
    const braces = /\{([^}]*)\}/.exec(clause);
    const outside = clause
      .replace(/\{[^}]*\}/, '')
      .replace(/,/g, ' ')
      .trim();
    if (outside !== '') found.push(outside);
    for (const name of braces?.[1]?.split(',') ?? [])
      if (name.trim() !== '' && !name.trim().startsWith('type ')) found.push(name.trim());
  }
  return found;
}

it('flags platform files that import runtime values from their own base module', () => {
  expect(
    runtimeSelfImports(
      'segmented.android.tsx',
      "import { helper, type Props } from './segmented';\nimport type { Other } from './segmented';",
    ),
  ).toEqual(['helper']);
  expect(runtimeSelfImports('segmented.ios.tsx', "import Thing from './segmented';")).toEqual([
    'Thing',
  ]);
  expect(
    runtimeSelfImports('segmented.ios.tsx', "import Base, { more } from './segmented';"),
  ).toEqual(['Base', 'more']);
  expect(
    runtimeSelfImports(
      'segmented.ios.tsx',
      "import Animated, { withSpring } from 'react-native-reanimated';\nimport { helper } from './segment-test-id';",
    ),
  ).toEqual([]);
});

it('keeps platform files from importing runtime values from their own base module', () => {
  const offenders = [join(root, 'src'), join(root, 'app')].flatMap((dir) =>
    sources(dir).flatMap((file) =>
      runtimeSelfImports(file, readFileSync(file, 'utf8')).map(
        (name) => `${relative(root, file)}: ${name}`,
      ),
    ),
  );
  expect(offenders).toEqual([]);
});
