import { describe, expect, it } from 'vitest';
import { readBotActivityPage } from '../src/cli/cli-activity-page.js';
import type { PersonaBotActivitySnapshot } from '../src/state/bot-state.js';

function snapshot(names: readonly string[]): PersonaBotActivitySnapshot {
  return {
    generation: 'g1',
    revision: 3,
    bots: [
      {
        slug: 'ada',
        state: 'working',
        sessions: names.map((name, index) => ({
          id: `s${index}`,
          role: 'orchestrator',
          name,
          revision: 1,
          at: 0,
          state: 'working',
        })),
      },
    ],
  };
}

describe('Bot activity pages', () => {
  it('keeps the whole serialized page, envelope and cursor included, within the byte cap', () => {
    const maxBytes = 8 * 1024;
    const page = readBotActivityPage({
      slug: 'ada',
      incarnation: '2026-11-01T00:00:00.000Z',
      snapshot: snapshot(['a', 'b', 'c', 'd'].map((id) => id.repeat(3_950))),
      limit: 4,
      maxBytes,
    });
    expect(page.bot?.sessions?.length).toBeGreaterThan(0);
    expect(page.nextCursor).toBeDefined();
    expect(Buffer.byteLength(JSON.stringify(page), 'utf8')).toBeLessThanOrEqual(maxBytes);
  });

  it('returns a session larger than the byte cap alone so the read still advances', () => {
    const request = {
      slug: 'ada',
      incarnation: '2026-11-01T00:00:00.000Z',
      snapshot: snapshot(['x'.repeat(16 * 1024), 'small']),
      limit: 2,
      maxBytes: 8 * 1024,
    };
    const first = readBotActivityPage(request);
    expect(first.bot?.sessions).toHaveLength(1);
    expect(first.complete).toBe(false);
    const second = readBotActivityPage({ ...request, cursor: first.nextCursor! });
    expect(second.bot?.sessions?.map((session) => session.name)).toEqual(['small']);
    expect(second.complete).toBe(true);
  });
});
