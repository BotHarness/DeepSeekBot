import { describe, expect, it } from 'vitest';

import { checkFastPolls, fastPolls, pollsByFile } from '../check-fast-polls.mjs';

describe('fast polls', () => {
  it('flags a short setInterval that loads data, through a constant or a literal', () => {
    const source = `
      const POLL_MS = 3000;
      setInterval(() => void load(), POLL_MS);
      window.setInterval(async () => { await refresh(); }, 2 * 1000);
      setInterval(() => actions.status().then(setStatus), 5_000);
    `;
    expect(fastPolls(source).map((poll) => [poll.timer, poll.delay])).toEqual([
      ['setInterval', 3000],
      ['setInterval', 2000],
      ['setInterval', 5000],
    ]);
  });

  it('flags a setTimeout that schedules its own function again', () => {
    const source = `
      const poll = async () => {
        try { await read(); } finally { timer = setTimeout(() => void poll(), 2500); }
      };
      function check() { sample(); timer = setTimeout(check, 1000); }
    `;
    expect(fastPolls(source).map((poll) => poll.delay)).toEqual([2500, 1000]);
  });

  it('ignores clocks, one-shot timers, slow polls and unresolved delays', () => {
    const source = `
      let mutableDelay = 1_000;
      setInterval(() => setNow(Date.now()), 1_000);
      setTimeout(() => void load(), 500);
      setInterval(() => void load(), 30_000);
      setInterval(() => void load(), delayMs);
      setInterval(() => void load(), mutableDelay);
      const refresh = () => { timer = setTimeout(() => void refresh(), 60_000); };
    `;
    expect(fastPolls(source)).toEqual([]);
  });

  it('resolves delays and named callbacks through the binding in scope', () => {
    const source = `
      const SECOND = 1000;
      const MS = 2 * SECOND;
      async function poll() { await readHost(); }
      setInterval(poll, MS);
      function fast() { const DELAY = 1000; setInterval(() => void readHost(), DELAY); }
      function slow() { const DELAY = 30_000; setInterval(() => void readHost(), DELAY); }
      function shadowed(SECOND) { setInterval(() => void readHost(), SECOND); }
      const tick = () => setNow(Date.now());
      setInterval(tick, SECOND);
    `;
    expect(fastPolls(source).map((poll) => [poll.line, poll.delay])).toEqual([
      [5, 2000],
      [6, 1000],
    ]);
  });

  it('only scans client sources', () => {
    const poll = 'setInterval(() => void load(), 1000);';
    expect(
      Object.keys(
        pollsByFile({
          'packages/client/src/client/a.tsx': poll,
          'apps/mobile/src/b.ts': poll,
          'packages/core/src/c.ts': poll,
        }),
      ),
    ).toEqual(['packages/client/src/client/a.tsx', 'apps/mobile/src/b.ts']);
  });

  it('fails a new fast poll and points to the guide and the allowlist', () => {
    const polls = {
      'packages/client/src/client/a.tsx': [{ line: 3, timer: 'setInterval', delay: 2000 }],
    };
    const [error] = checkFastPolls(polls, {});
    expect(error).toContain('packages/client/src/client/a.tsx:3 setInterval 2000 ms');
    expect(error).toContain('docs/agents/live-host-state.md');
    expect(error).toContain('scripts/fast-poll-allowlist.json');
  });

  it('accepts an allowlisted file with a reason, and asks to lower a stale count', () => {
    const polls = { 'a.ts': [{ line: 1, timer: 'setTimeout', delay: 1000 }] };
    const reason = 'Reconnect after the stream ends, not a poll.';
    expect(checkFastPolls(polls, { 'a.ts': { count: 1, reason } })).toEqual([]);
    expect(checkFastPolls(polls, { 'a.ts': { count: 2, reason } })[0]).toContain('--update');
    expect(checkFastPolls(polls, { 'a.ts': { count: 1, reason: '' } })[0]).toContain('reason');
    expect(
      checkFastPolls(
        { 'a.ts': [...polls['a.ts'], ...polls['a.ts']] },
        { 'a.ts': { count: 1, reason } },
      ),
    ).toHaveLength(1);
  });
});
