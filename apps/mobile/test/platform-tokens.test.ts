import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

const root = new URL('../src', import.meta.url).pathname;

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

  it('keep colour literals out of platform-specific UI', () => {
    const offenders = platformFiles(root).filter((path) =>
      /['"`]#[0-9a-f]{3,8}['"`]|\brgba?\(/i.test(readFileSync(path, 'utf8')),
    );
    expect(offenders.map((path) => path.slice(root.length + 1))).toEqual([]);
  });
});
