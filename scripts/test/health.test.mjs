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

  it('fails a new file over the limit and a new tsc exclusion, not a baselined file that grew', () => {
    const baseline = { 'long-files': ['old.ts'], 'tsc-exclude': ['a.ts'] };
    const { errors } = check(
      state({ 'old.ts': 1300, 'new.ts': LIMIT + 5 }, ['a.ts', 'b.ts']),
      baseline,
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('new.ts');
    expect(errors[1]).toContain('b.ts');
  });

  it('asks to drop baseline entries the code no longer needs, and never adds one', () => {
    const baseline = { 'long-files': ['gone.ts', 'old.ts'], 'tsc-exclude': ['a.ts'] };
    const current = state({ 'new.ts': 1100, 'old.ts': 1100 });
    expect(check(current, baseline).stale).toHaveLength(2);
    expect(lowered(current, baseline)).toEqual({ 'long-files': ['old.ts'], 'tsc-exclude': [] });
  });

  it('rejects a baseline raised since the base', () => {
    const base = { 'long-files': ['old.ts'], 'tsc-exclude': [] };
    expect(raised(base, base)).toEqual([]);
    expect(
      raised(base, { 'long-files': ['new.ts', 'old.ts'], 'tsc-exclude': ['a.ts'] }),
    ).toHaveLength(2);
  });

  it('warns when a change makes a long file or the agent prose longer', () => {
    const notes = growth(
      state({ 'old.ts': 1200 }),
      state({ 'old.ts': 1250 }, [], { 'AGENTS.md': 120 }),
    );
    expect(notes.map((note) => note.path)).toEqual(['old.ts', 'AGENTS.md']);
  });
});
