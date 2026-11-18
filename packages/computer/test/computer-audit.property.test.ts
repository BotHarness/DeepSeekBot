import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';

import { createComputerPauseStore } from '../src/local-video-owner.js';
import { COMPUTER_TOOLS } from '../src/tool/catalog.js';
import { auditSummary } from '../src/tool/provider.js';

const marker = fc.stringMatching(/^[A-Z]{6}[0-9]{4}$/u).map((value) => `SECRET${value}`);
const root = mkdtempSync(join(tmpdir(), 'computer-pause-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let next = 0;
const fresh = (): string => join(root, String(next++), 'computer-pause.json');

describe('Computer audit and pause (docs/decisions/computer.md)', () => {
  it('never puts typed text or a predicate into any audit summary', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...COMPUTER_TOOLS.map((spec) => spec.raw)),
        marker,
        fc.dictionary(fc.constantFrom('pid', 'window_id', 'x', 'y', 'key', 'app'), fc.nat()),
        (raw, secret, other) => {
          const summary = auditSummary(raw, { ...other, text: secret, predicate: secret });
          expect(summary).not.toContain(secret);
          if (raw === 'type_text') expect(summary).toContain(`chars=${secret.length}`);
        },
      ),
    );
  });

  it('reads back the last pause written, atomically, and survives a new store on the same file', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 6 }), (writes) => {
        const path = fresh();
        const store = createComputerPauseStore(path);
        for (const paused of writes) store.write(paused);
        expect(createComputerPauseStore(path).read()).toBe(writes.at(-1) ?? false);
        if (existsSync(path))
          expect(readdirSync(join(path, '..')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
      }),
      { numRuns: 50 },
    );
  });

  it('refuses any pause record that is not version 1 with a boolean, instead of guessing', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.jsonValue().map((value) => JSON.stringify(value)),
          fc
            .record(
              {
                version: fc.oneof(fc.constant(1), fc.anything()),
                paused: fc.oneof(fc.boolean(), fc.anything()),
              },
              { requiredKeys: [] },
            )
            .map((value) => JSON.stringify(value)),
        ),
        (source) => {
          const path = fresh();
          createComputerPauseStore(path).write(false);
          writeFileSync(path, source);
          let parsed: unknown;
          try {
            parsed = JSON.parse(source);
          } catch {
            parsed = undefined;
          }
          const valid =
            typeof parsed === 'object' &&
            parsed !== null &&
            'version' in parsed &&
            parsed.version === 1 &&
            'paused' in parsed &&
            typeof parsed.paused === 'boolean';
          const store = createComputerPauseStore(path);
          if (valid) expect(store.read()).toBe((parsed as { paused: boolean }).paused);
          else expect(() => store.read()).toThrow();
        },
      ),
      { numRuns: 200 },
    );
  });
});
