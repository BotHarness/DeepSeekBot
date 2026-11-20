import { join, relative, sep } from 'node:path';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { sanitizeProfileName } from '../src/runtimes.js';
import { BROWSER_TOOLS } from '../src/tool/catalog.js';

const marker = fc.stringMatching(/^[A-Z]{6}[0-9]{4}$/u).map((value) => `SECRET${value}`);

describe('Bot Browser authority (docs/decisions/browser.md)', () => {
  it('keeps typed text and Host directories out of Browser Audit for every tool', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BROWSER_TOOLS),
        marker,
        marker,
        fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean())),
        (spec, typed, directory, values) => {
          const summary = spec.audit({
            ...Object.fromEntries(
              Object.keys(spec.inputSchema['properties'] ?? {}).map((key, index) => [
                key,
                values[index] ?? 'x',
              ]),
            ),
            text: typed,
            path: `/home/${directory}/report.pdf`,
          });
          expect(summary).not.toContain(typed);
          expect(summary).not.toContain(directory);
          if (spec.raw === 'type') expect(summary).toContain(`chars=${typed.length}`);
          if (spec.raw === 'upload') expect(summary).toContain('file=report.pdf');
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('caps the URL a Browser Audit line can carry', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 161, maxLength: 4000 }), (url) => {
        for (const spec of BROWSER_TOOLS.filter((tool) => ['open', 'tabs'].includes(tool.raw)))
          expect(spec.audit({ action: 'open', url })).toBe(
            spec.audit({ action: 'open', url: url.slice(0, 160) }),
          );
      }),
    );
  });

  it('keeps every named Browser profile inside the profile folder, never as . or ..', () => {
    const root = join('/profile', 'botharness', 'browser-profiles');
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ maxLength: 60 }),
          fc.constantFrom('.', '..', ' .. ', '../x', 'a/../..', 'default', 'work.tenant-1'),
        ),
        (value) => {
          const name = sanitizeProfileName(value);
          if (name === '') return;
          expect(name).toMatch(/^[a-zA-Z0-9._-]{1,40}$/u);
          expect(['.', '..', 'default']).not.toContain(name);
          const path = relative(root, join(root, name));
          expect(path).toBe(name);
          expect(path.split(sep)).toHaveLength(1);
        },
      ),
      { numRuns: 2000 },
    );
  });
});
