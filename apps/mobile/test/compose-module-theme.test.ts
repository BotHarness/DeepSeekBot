import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const mobileRoot = fileURLToPath(new URL('..', import.meta.url));
const modules = [
  'material-button-group',
  'material-fab-menu',
  'material-search',
  'material-search-bar',
  'material-split-button',
];
const adapters = [
  'src/ui/primitives/icon-tabs.android.tsx',
  'src/ui/shell/creation-menu-button.android.tsx',
  'src/ui/primitives/search-field.android.tsx',
  'src/ui/shell/chats-search-bar.android.tsx',
  'src/ui/primitives/split-button.android.tsx',
];

function kotlin(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return kotlin(path);
    return name.endsWith('.kt') ? [readFileSync(path, 'utf8')] : [];
  });
}

describe('local Compose modules inherit the Host Material theme', () => {
  it.each(modules)('%s registers an Expo UI view and builds no colour scheme', (name) => {
    const sources = kotlin(join(mobileRoot, 'modules', name, 'android/src/main')).join('\n');
    expect(sources).toContain('ExpoUIView<');
    expect(sources).not.toMatch(/\b(?:light|dark)ColorScheme\(|ComposeView\(|cssColor|parseColor/);
  });

  it.each(adapters)('%s renders inside a seeded Host without colour props', (path) => {
    const source = readFileSync(join(mobileRoot, path), 'utf8');
    expect(source).toMatch(
      /<Host[^>]*colorScheme=\{theme\.scheme\}[^>]*seedColor=\{theme\.color\.accent\}/s,
    );
    expect(source).not.toMatch(
      /\bdark=\{|theme\.color\.(?:fg|muted|base|onAccent)\b|theme\.layer\./,
    );
  });
});
