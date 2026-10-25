import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectDevReference } from '../docs-reference.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function configDefault(expression, bindings = '') {
  const root = mkdtempSync(join(tmpdir(), 'botharness-docs-reference-'));
  roots.push(root);
  const directory = join(root, 'packages/core/src');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, 'plugin.ts'),
    `${bindings}\nexport interface BotHarnessConfig { optional?: unknown }\nexport const Config = Schema.object({ optional: Schema.any().default(${expression}) });\n`,
  );
  return collectDevReference(root).config[0];
}

describe('developer reference undefined defaults', () => {
  it.each([
    'undefined',
    'undefined as unknown as BotSubagentPresetConfig',
    '(undefined)',
    'undefined satisfies unknown',
  ])('preserves the global undefined default in %s', (expression) => {
    expect(configDefault(expression)).toEqual({
      name: 'optional',
      type: 'unknown',
      default: undefined,
      description: undefined,
      source: 'packages/core/src/plugin.ts',
    });
  });

  it('resolves a declared alias of undefined', () => {
    expect(configDefault('omitted', 'const omitted = undefined;').default).toBeUndefined();
  });

  it('does not override a local binding named undefined', () => {
    expect(configDefault('undefined', 'const undefined = "local";').default).toBe('local');
  });

  it('continues to reject unknown identifiers', () => {
    expect(() => configDefault('missing')).toThrow('docs reference: unresolved binding missing');
  });

  it('continues to reject circular bindings', () => {
    expect(() => configDefault('undefined', 'const undefined = undefined;')).toThrow(
      'docs reference: circular binding undefined',
    );
  });
});
