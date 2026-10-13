import { describe, expect, it } from 'vitest';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { inboxFixture as fixture } from './inbox-fixture.js';

describe('Orchestrator-resolved Bot Inbox', () => {
  it('leaves an item open after a turn and summarizes older open items in the next turn', async () => {
    const f = await fixture();
    try {
      const first = await f.send('Please review PR 12 before Friday');
      expect(f.state(first)).toBe('open');
      expect(f.runs[0]!.inbox).not.toContain('[Open Inbox]');

      const second = await f.send('Unrelated: book the team dinner');
      expect(f.state(first)).toBe('open');
      expect(f.state(second)).toBe('open');
      const block = f.runs[1]!.inbox;
      expect(block).toContain('[Open Inbox] 1 item');
      expect(block).toContain('Please review PR 12');
      expect(block).toContain(first);
      expect(block).toContain('inbox_list');
      expect(block).not.toContain('book the team dinner');
    } finally {
      await f.close();
    }
  }, 60000);

  it('lists open items grouped by conversation and resolves them by id', async () => {
    const f = await fixture();
    try {
      const first = await f.send('Please review PR 12');
      const second = await f.send('Also check the PR 12 changelog');
      let page: ReturnType<NonNullable<OrchestratorAgentRun['triage']>['list']> | undefined;
      let inTurn = '';
      const third = await f.send('Thanks, that is all for PR 12', (run) => {
        inTurn = run.triage!.current()[0]!;
        page = run.triage!.list();
        return run.triage!.resolve({
          ids: [first, second],
          outcome: 'done',
          note: 'Reviewed PR 12',
        });
      });
      expect(inTurn).toBe(third);
      expect(page).toMatchObject({
        total: 3,
        groups: [{ channelId: f.dm.id, count: 3, ids: [third, second, first] }],
      });
      expect(page!.groups[0]!.latest).toContain('that is all for PR 12');
      expect(f.results[0]).toMatchObject({
        outcome: 'resolved',
        resolved: [first, second].sort(),
        alreadyResolved: [],
      });
      expect(f.state(first)).toBe('handled');
      expect(f.state(second)).toBe('handled');
      expect(f.state(third)).toBe('open');
      await f.send('What did you do about PR 12?', (run) => run.inboxHistory!({ limit: 10 }));
      const history = f.results[1] as {
        items: Array<{ sourceEventId: string; resolutionNote?: string }>;
      };
      expect(history.items.find((item) => item.sourceEventId === first)?.resolutionNote).toBe(
        'Reviewed PR 12',
      );
    } finally {
      await f.close();
    }
  }, 60000);

  it('resolves the item that woke the current turn so it never becomes open', async () => {
    const f = await fixture();
    try {
      let id = '';
      id = await f.send('FYI the build is green', (run) =>
        run.triage!.resolve({ ids: [run.triage!.current()[0]!], outcome: 'done' }),
      );
      expect(f.results[0]).toMatchObject({ outcome: 'resolved', resolved: [id] });
      expect(f.state(id)).toBe('handled');
    } finally {
      await f.close();
    }
  }, 60000);

  it('resolves a filter only after confirming the matched count', async () => {
    const f = await fixture();
    try {
      const a = await f.send('Newsletter one');
      const b = await f.send('Newsletter two');
      await f.send('Clear the newsletters', async (run) => {
        const preview = run.triage!.resolve({ filter: { channelId: f.dm.id }, outcome: 'ignored' });
        if (preview.outcome !== 'confirm') throw new Error('Expected a confirmation');
        const stale = run.triage!.resolve({
          filter: { channelId: f.dm.id },
          outcome: 'done',
          confirm: preview.token,
        });
        const done = run.triage!.resolve({
          filter: { channelId: f.dm.id },
          outcome: 'ignored',
          confirm: preview.token,
          note: 'Newsletters need no action',
        });
        return { preview, stale, done };
      });
      const { preview, stale, done } = f.results[0] as Record<string, unknown>;
      expect(preview).toMatchObject({ outcome: 'confirm', count: 3, token: expect.any(String) });
      expect(stale).toMatchObject({ outcome: 'confirm', count: 3 });
      expect(done).toMatchObject({ outcome: 'resolved', resolved: expect.arrayContaining([a, b]) });
      expect(f.state(a)).toBe('ignored');
      expect(f.state(b)).toBe('ignored');
    } finally {
      await f.close();
    }
  }, 60000);

  it('refuses ids that are not this Bot’s seen admissions', async () => {
    const f = await fixture();
    try {
      await f.send('Hello', (run) => {
        expect(() => run.triage!.resolve({ ids: ['missing'], outcome: 'done' })).toThrow(/missing/);
        expect(() => run.triage!.resolve({ outcome: 'done' })).toThrow(/ids or a filter/);
        expect(() => run.triage!.list({ limit: 0 })).toThrow();
      });
      expect(f.results).toHaveLength(1);
    } finally {
      await f.close();
    }
  }, 60000);
});
