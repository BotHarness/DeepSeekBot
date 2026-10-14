import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const bundle = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8');

describe('browser client stylesheet', () => {
  it('compiles StyleX at build time and ships every class it uses', () => {
    expect(bundle).not.toContain('@bh-stylex-css');
    expect(bundle).not.toMatch(/require\("@stylexjs\//);
    const classes = new Set(
      [...bundle.matchAll(/"(bhx[a-z0-9]+(?: bhx[a-z0-9]+)*)"/g)].flatMap((match) =>
        match[1]!.split(' '),
      ),
    );
    expect(classes.size).toBeGreaterThan(10);
    expect([...classes].filter((name) => !bundle.includes(`.${name}`))).toEqual([]);
    expect(bundle).toContain('.bhx-level-0{}');
  });

  it('no longer depends on the legacy settings classes', () => {
    expect(bundle).not.toMatch(/bh-settings-/);
  });
});
