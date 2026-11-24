import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/ui/shell/navigation-destinations.android.tsx', import.meta.url),
  'utf8',
);
const drawables = [
  ...source.matchAll(/require\('\.\.\/\.\.\/\.\.\/assets\/toolbar\/([\w-]+\.xml)'\)/g),
].map((match) => match[1]!);

describe('Android tab drawables', () => {
  it('cover an outline and a filled icon for every tab', () => {
    expect(new Set(drawables)).toEqual(
      new Set([
        'chats.xml',
        'chats-filled.xml',
        'activity.xml',
        'activity-filled.xml',
        'sessions.xml',
        'sessions-filled.xml',
        'settings.xml',
        'settings-outline.xml',
      ]),
    );
  });

  it.each(drawables)('%s draws with an opaque fill, never a stroke', (name) => {
    const xml = readFileSync(new URL(`../assets/toolbar/${name}`, import.meta.url), 'utf8');
    const paths = [...xml.matchAll(/<path\b[^>]*>/g)].map((match) => match[0]);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const fill = /android:fillColor="#([0-9A-Fa-f]{6,8})"/.exec(path)?.[1];
      expect(fill).toBeDefined();
      expect(fill!.length === 8 ? fill!.slice(0, 2).toUpperCase() : 'FF').not.toBe('00');
      expect(path).not.toMatch(/android:stroke/);
      expect(/android:pathData="([^"]+)"/.exec(path)?.[1]?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});
