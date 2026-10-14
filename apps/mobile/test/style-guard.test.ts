import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

const LEGACY = new Set([
  'app/(tabs)/_layout.tsx',
  'app/(tabs)/index.tsx',
  'app/full-client.tsx',
  'app/pair.tsx',
  'app/dm/[slug].tsx',
  'app/inbox/[id].tsx',
  'src/ui/approval-view.tsx',
  'src/ui/bot-avatar.tsx',
  'src/ui/connection-banner.tsx',
  'src/ui/floating-exit.tsx',
  'src/ui/inbox-list.tsx',
  'src/ui/question-view.tsx',
  'src/ui/request-parts.tsx',
]);

const LITERAL_COLOR =
  /['"`](?:#[0-9a-f]{3,8}|rgba?\(|hsla?\()|[cC]olor\s*:\s*['"`](?!transparent['"`])[a-z]+['"`]/i;
const LITERAL_SCALE =
  /\b(?:fontSize|lineHeight|fontWeight|letterSpacing|gap|rowGap|columnGap|padding\w*|margin\w*|border\w*Radius|borderRadius|border\w*Width)\s*:\s*(?:-?[1-9]|['"`]\d)/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'design' ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [relative(root, path).replaceAll('\\', '/')] : [];
  });
}

function violations(file: string): string[] {
  return readFileSync(join(root, file), 'utf8')
    .split('\n')
    .flatMap((line, index) =>
      LITERAL_COLOR.test(line) || LITERAL_SCALE.test(line)
        ? [`${file}:${index + 1}: ${line.trim()}`]
        : [],
    );
}

const files = [...sources(join(root, 'app')), ...sources(join(root, 'src/ui'))];

describe('mobile style guard', () => {
  it('keeps colour, type, spacing, radius and edge values on the design tokens', () => {
    expect(files.filter((file) => !LEGACY.has(file)).flatMap(violations)).toEqual([]);
  });

  it('drops a legacy file from the list once it is on the tokens', () => {
    expect(
      [...LEGACY].filter((file) => !files.includes(file) || violations(file).length === 0),
    ).toEqual([]);
  });
});
