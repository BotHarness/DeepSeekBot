import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ PlatformColor: (name: string) => ({ semantic: [name] }) }));
vi.mock('@expo/ui/jetpack-compose', () => ({
  useMaterialColors: (options: { colorScheme: string; seedColor: string }) => ({
    primary: `${options.colorScheme}:${options.seedColor}`,
  }),
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ scheme: 'dark', color: { accent: '#3366ff' } }),
}));
import { materialType, useMaterialRoles } from '../src/ui/design/material-tokens';
import { systemColors, systemType } from '../src/ui/design/system-tokens';

const mobileRoot = fileURLToPath(new URL('..', import.meta.url));
const colourLiteral =
  /['"`]#[0-9a-f]{3,8}['"`]|\brgba?\(|\b(?:fill|stroke|stopColor)=['"](?!none['"]|currentColor['"]|transparent['"])[a-z]+['"]/i;

function platformFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return platformFiles(path);
    return /\.(android|ios)\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('platform token layers', () => {
  it('derive Android Material roles from the theme seed and scheme', () => {
    expect(useMaterialRoles().primary).toBe('dark:#3366ff');
    expect(materialType).toEqual({
      meta: 'bodySmall',
      body: 'bodyMedium',
      title: 'titleMedium',
      display: 'headlineSmall',
    });
  });

  it('name iOS semantic system colours and Dynamic Type styles', () => {
    expect(systemColors.label).toEqual({ semantic: ['label'] });
    expect(systemColors.groupedBackground).toEqual({ semantic: ['systemGroupedBackground'] });
    expect(systemType).toEqual({
      meta: 'footnote',
      body: 'body',
      title: 'headline',
      display: 'title1',
    });
  });

  it('recognise hex, rgb and named SVG colour literals', () => {
    expect(colourLiteral.test("color: '#fff'")).toBe(true);
    expect(colourLiteral.test('rgba(0, 0, 0, 0.5)')).toBe(true);
    expect(colourLiteral.test('<Path fill="red" />')).toBe(true);
    expect(colourLiteral.test('<Path fill="none" stroke={roles.primary} />')).toBe(false);
  });

  it('keep colour literals out of platform-specific UI', () => {
    const offenders = ['app', 'src']
      .flatMap((dir) => platformFiles(join(mobileRoot, dir)))
      .filter((path) => colourLiteral.test(readFileSync(path, 'utf8')));
    expect(offenders.map((path) => relative(mobileRoot, path))).toEqual([]);
  });
});
