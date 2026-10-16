import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkFeatureMap, mapDirectory } from '../check-feature-map.mjs';

const roots = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'feature-map-'));
  roots.push(root);
  const write = (path, text) => {
    const file = join(root, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, text);
  };
  write('scripts/e2e-mapped.mjs', '');
  write('scripts/e2e-unmapped.mjs', '');
  write('.agents/skills/verify-deepseekbot/SKILL.md', '[Map](features/README.md)');
  write('.agents/skills/verify-deepseekbot/references/observation.md', '# Observe');
  write(
    `${mapDirectory}/README.md`,
    '| Feature | scripts/e2e-mapped.mjs | [Feature](feature.md) |',
  );
  write(
    `${mapDirectory}/feature.md`,
    [
      '# Feature',
      '## Sub-features',
      '## How to get to it (user POV)',
      '## Driving it with verify-app',
      '`node scripts/e2e-mapped.mjs`',
      '## Gotchas',
    ].join('\n'),
  );
  return { root, write };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('feature map integrity', () => {
  it('reports unmapped journeys without inventing runtime qualification', () => {
    const { root } = fixture();
    expect(checkFeatureMap(root)).toMatchObject({
      ok: true,
      features: 1,
      mappedJourneys: 1,
      unmappedJourneys: ['scripts/e2e-unmapped.mjs'],
    });
  });
  it('rejects missing or duplicated index rows', () => {
    const { root, write } = fixture();
    write(`${mapDirectory}/README.md`, '');
    expect(checkFeatureMap(root).errors).toContain(
      'feature.md: expected exactly one feature index row, found 0',
    );
    write(`${mapDirectory}/README.md`, '| [Feature](feature.md) |\n| [Again](feature.md) |');
    expect(checkFeatureMap(root).errors).toContain(
      'feature.md: expected exactly one feature index row, found 2',
    );
  });
  it('does not count a cross-reference outside the File column as a feature row', () => {
    const { root, write } = fixture();
    write(
      `${mapDirectory}/README.md`,
      '| [Related feature](feature.md) | scripts/e2e-mapped.mjs | no feature file |',
    );
    expect(checkFeatureMap(root).errors).toContain(
      'feature.md: expected exactly one feature index row, found 0',
    );
  });
  it('rejects an index that hides a scripted journey', () => {
    const { root, write } = fixture();
    write(`${mapDirectory}/README.md`, '| none | [Feature](feature.md) |');
    expect(checkFeatureMap(root).errors).toContain(
      'feature.md: index row is missing journey scripts/e2e-mapped.mjs',
    );
  });
  it('rejects a journey mentioned only outside the Scripted journey column', () => {
    const { root, write } = fixture();
    write(`${mapDirectory}/README.md`, '| scripts/e2e-mapped.mjs | none | [Feature](feature.md) |');
    expect(checkFeatureMap(root).errors).toContain(
      'feature.md: index row is missing journey scripts/e2e-mapped.mjs',
    );
  });
  it('checks missing scripts with dotted basenames', () => {
    const { root, write } = fixture();
    const feature = readFileSync(join(root, mapDirectory, 'feature.md'), 'utf8');
    write(`${mapDirectory}/feature.md`, feature.replaceAll('e2e-mapped.mjs', 'e2e-release.v2.mjs'));
    write(
      `${mapDirectory}/README.md`,
      '| Feature | scripts/e2e-release.v2.mjs | [Feature](feature.md) |',
    );
    expect(checkFeatureMap(root).errors.join('\n')).toContain(
      'missing script scripts/e2e-release.v2.mjs',
    );
  });
  it('rejects missing scripts, broken links, and incomplete feature instructions', () => {
    const { root, write } = fixture();
    write(
      `${mapDirectory}/feature.md`,
      '# Feature\n`node scripts/e2e-deleted.mjs`\n[missing](gone.md)',
    );
    const errors = checkFeatureMap(root).errors.join('\n');
    expect(errors).toContain('missing script scripts/e2e-deleted.mjs');
    expect(errors).toContain('broken link gone.md');
    expect(errors).toContain('missing section Gotchas');
    expect(errors).toContain('index journey is absent from the feature');
  });
});
