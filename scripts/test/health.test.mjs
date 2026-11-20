import { describe, expect, it } from 'vitest';
import {
  check,
  collect,
  growth,
  isSource,
  LIMIT,
  lineCount,
  lowered,
  raised,
  syncGuardrailTable,
  tscExclude,
} from '../health.mjs';

const lines = (count) => 'x\n'.repeat(count);
const state = (fileLines, tsc = [], prose = { 'AGENTS.md': 100 }) => ({
  'file-lines': fileLines,
  'tsc-exclude': tsc,
  'agent-prose-bytes': prose,
});

describe('codebase health ratchets', () => {
  it('counts lines and skips generated, built and vendored files', () => {
    expect(lineCount('')).toBe(0);
    expect(lineCount('a\nb\n')).toBe(2);
    expect(lineCount('a\nb')).toBe(2);
    expect(isSource('packages/core/src/bot.ts')).toBe(true);
    expect(isSource('packages/computer/lib/client.js')).toBe(false);
    expect(isSource('ds/tobs-tokens.generated.ts')).toBe(false);
    expect(isSource('packages/core/src/types.d.ts')).toBe(false);
    expect(isSource('.agents/skills/x/scripts/run.mjs')).toBe(false);
    expect(isSource('README.md')).toBe(false);
  });

  it('reads the tsconfig exclude list despite comments', () => {
    const text =
      '{\n  // note\n  "include": ["src"],\n  "exclude": [\n    "b.test.ts",\n    "a.test.ts"\n  ]\n}';
    expect(tscExclude(text)).toEqual(['a.test.ts', 'b.test.ts']);
  });

  it('records only files over the limit and the agent prose size', () => {
    const files = {
      'packages/a/src/big.ts': lines(LIMIT + 1),
      'packages/a/src/ok.ts': lines(LIMIT),
      'AGENTS.md': 'abc',
      'tsconfig.json': '{"exclude": ["x.ts"]}',
    };
    expect(collect((path) => files[path], Object.keys(files))).toEqual(
      state({ 'packages/a/src/big.ts': LIMIT + 1 }, ['x.ts'], { 'AGENTS.md': 3 }),
    );
  });

  it('counts agent prose the same in CRLF and LF checkouts', () => {
    const lf = { 'AGENTS.md': 'a\nb\n' };
    const crlf = { 'AGENTS.md': 'a\r\nb\r\n' };
    expect(collect((path) => crlf[path], [])['agent-prose-bytes']).toEqual(
      collect((path) => lf[path], [])['agent-prose-bytes'],
    );
  });

  it('fails a new file over the limit and a new tsc exclusion, not a baselined file that grew', () => {
    const baseline = {
      'long-files': ['old.ts'],
      'tsc-exclude': ['a.ts'],
      'agent-prose-bytes': 100,
    };
    const { errors } = check(
      state({ 'old.ts': 1300, 'new.ts': LIMIT + 5 }, ['a.ts', 'b.ts']),
      baseline,
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('new.ts');
    expect(errors[1]).toContain('b.ts');
  });

  it('asks to drop baseline entries the code no longer needs, and never adds one', () => {
    const baseline = {
      'long-files': ['gone.ts', 'old.ts'],
      'tsc-exclude': ['a.ts'],
      'agent-prose-bytes': 100,
    };
    const current = state({ 'new.ts': 1100, 'old.ts': 1100 });
    expect(check(current, baseline).stale).toHaveLength(2);
    expect(lowered(current, baseline)).toEqual({
      'long-files': ['old.ts'],
      'tsc-exclude': [],
      'agent-prose-bytes': 100,
    });
  });

  it('rejects a baseline raised since the base', () => {
    const base = { 'long-files': ['old.ts'], 'tsc-exclude': [] };
    expect(raised(base, base)).toEqual([]);
    expect(
      raised(base, { 'long-files': ['new.ts', 'old.ts'], 'tsc-exclude': ['a.ts'] }),
    ).toHaveLength(2);
  });

  it('caps the combined bytes of all always-loaded files', () => {
    const current = state({}, [], {
      'AGENTS.md': 70,
      'CLAUDE.md': 20,
      'apps/mobile/AGENTS.md': 11,
    });
    expect(check(current, { 'agent-prose-bytes': 101 }).errors).toEqual([]);
    expect(check(current, { 'agent-prose-bytes': 100 }).errors).toEqual([
      expect.stringContaining('101 bytes, above the 100-byte cap'),
    ]);
    expect(check(current, {}).errors).toEqual([
      expect.stringContaining('needs a nonnegative agent-prose-bytes cap'),
    ]);
  });

  it('lowers the prose cap and rejects raising it above the base', () => {
    const base = { 'agent-prose-bytes': 90 };
    expect(lowered(state({}), base)['agent-prose-bytes']).toBe(90);
    const lower = lowered(state({}, [], { 'AGENTS.md': 80 }), base);
    expect(lower['agent-prose-bytes']).toBe(80);
    expect(raised(base, lower)).toEqual([]);
    expect(raised(base, { 'agent-prose-bytes': 91 })).toEqual(['agent-prose-bytes: 90 -> 91']);
  });

  it('syncs the rule table from the registry and preserves the surrounding guide', () => {
    const text =
      'Before\n<!-- guardrail-table:start -->\nstale\n<!-- guardrail-table:end -->\nAfter';
    const rules = [{ id: 'source-policy', check: 'scripts/check-source-policy.mjs' }];
    const synced = syncGuardrailTable(text, rules);
    expect(synced).toContain('`source-policy`');
    expect(synced).toContain('[check-source-policy.mjs](scripts/check-source-policy.mjs)');
    expect(synced).not.toContain('stale');
    expect(synced).toMatch(/^Before\n[\s\S]+\nAfter$/u);
    expect(syncGuardrailTable(synced, rules)).toBe(synced);
  });

  it('warns when a change makes a long file or the agent prose longer', () => {
    const notes = growth(
      state({ 'old.ts': 1200 }),
      state({ 'old.ts': 1250 }, [], { 'AGENTS.md': 120 }),
    );
    expect(notes.map((note) => note.path)).toEqual(['old.ts', 'AGENTS.md']);
  });
});
