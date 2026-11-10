import { describe, expect, it } from 'vitest';
import { checkHostCasts, hostCastCount } from '../check-host-casts.mjs';

describe('Host Context cast check', () => {
  it('counts direct, property and multi-line Context casts', () => {
    expect(
      hostCastCount(
        [
          'const a = ctx as unknown as { tools: unknown };',
          'const b = (agentCtx.tools as unknown as Legacy).presentAs;',
          'const c = viewerCtx?.connection\n  as unknown as Connection;',
          'const d = value as unknown as Other;',
        ].join('\n'),
      ),
    ).toBe(3);
  });

  it('rejects a new cast and requires the baseline to shrink when one is removed', () => {
    expect(checkHostCasts({ 'a.ts': 1 }, { 'a.ts': 1 })).toEqual([]);
    expect(checkHostCasts({ 'a.ts': 2 }, { 'a.ts': 1 })[0]).toMatch(/^a\.ts: 1 new Host Context/u);
    expect(checkHostCasts({ 'b.ts': 1 }, {})[0]).toMatch(/^b\.ts: 1 new Host Context/u);
    expect(checkHostCasts({}, { 'a.ts': 1 })[0]).toMatch(/only shrinks/u);
  });
});
