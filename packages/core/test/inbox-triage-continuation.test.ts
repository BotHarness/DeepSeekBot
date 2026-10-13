import { describe, expect, it } from 'vitest';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { inboxFixture as fixture } from './inbox-fixture.js';

const resolveOldest = (run: OrchestratorAgentRun) => {
  const ids = run.triage!.list().groups.flatMap((group) => group.ids);
  return run.triage!.resolve({ ids: [ids.at(-1)!], outcome: 'done' });
};

describe('Orchestrator triage continuation', () => {
  it('wakes again while an item stays open and stops when a round makes no progress', async () => {
    const f = await fixture({ triageContinuation: true });
    try {
      const item = await f.send('Please review PR 12');
      expect(f.runs).toHaveLength(2);
      expect(f.runs[1]!.message).toContain('[Triage] 1 item is still open');
      expect(f.runs[1]!.inbox).toContain(item);
      expect(f.state(item)).toBe('open');
      await f.core.runtime.whenIdle();
      expect(f.runs).toHaveLength(2);
    } finally {
      await f.close();
    }
  }, 60000);

  it('keeps waking while each round resolves something', async () => {
    const f = await fixture({ triageContinuation: true });
    try {
      const first = await f.send('First ask');
      const second = await f.send('Second ask', () => undefined, resolveOldest);
      expect(f.runs.map((run) => run.message.slice(0, 22))).toEqual([
        expect.stringContaining('First ask'),
        '[Triage] 1 item is sti',
        expect.stringContaining('Second ask'),
        '[Triage] 2 items are s',
        '[Triage] 1 item is sti',
      ]);
      expect(f.state(first)).toBe('handled');
      expect(f.state(second)).toBe('open');
    } finally {
      await f.close();
    }
  }, 60000);

  it('does not wake again when the turn resolves everything it saw', async () => {
    const f = await fixture({ triageContinuation: true });
    try {
      await f.send('FYI the build is green', (run) =>
        run.triage!.resolve({ ids: run.triage!.current(), outcome: 'done' }),
      );
      expect(f.runs).toHaveLength(1);
    } finally {
      await f.close();
    }
  }, 60000);

  it('resolves the current item by the Message ID shown in its turn header', async () => {
    const f = await fixture({ triageContinuation: true });
    try {
      const id = await f.send('FYI the deploy finished', (run) => {
        const messageId = 'human-1';
        expect(() => run.triage!.resolve({ outcome: 'done' })).toThrow(/this turn's items are/);
        return run.triage!.resolve({ ids: [messageId], outcome: 'done' });
      });
      expect(f.results[0]).toMatchObject({ outcome: 'resolved', resolved: [id] });
      expect(f.runs).toHaveLength(1);
    } finally {
      await f.close();
    }
  }, 60000);

  it('maps a Message ID shared by two channels to the item in this turn', async () => {
    const f = await fixture();
    try {
      const group = f.core.channels.createGroup({ name: 'Crew', members: ['ada'] });
      await f.core.channels.appendMessage(group.id, {
        id: 'human-1',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada the build is red',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      f.core.runtime.admitGroupMessage(group.id, 'human-1');
      await f.core.runtime.whenIdle();
      const groupItem = f.core.attention
        .list({ botSlug: 'ada', limit: 100 })
        .items.find((item) => item.sourceChannelId === group.id)!.id;
      await f.send('FYI the deploy finished', (run) =>
        run.triage!.resolve({ ids: ['human-1'], outcome: 'done' }),
      );
      const dmItem = f.core.attention
        .list({ botSlug: 'ada', limit: 100 })
        .items.find((item) => item.sourceChannelId === f.dm.id)!.id;
      expect(f.results[0]).toMatchObject({ outcome: 'resolved', resolved: [dmItem] });
      expect(f.state(groupItem)).toBe('open');
    } finally {
      await f.close();
    }
  }, 60000);

  it('rejects a Message ID that matches open items in two channels', async () => {
    const f = await fixture();
    try {
      await f.send('Waiting on legal');
      const group = f.core.channels.createGroup({ name: 'Crew', members: ['ada'] });
      await f.core.channels.appendMessage(group.id, {
        id: 'human-1',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada the build is red',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      f.core.runtime.admitGroupMessage(group.id, 'human-1');
      await f.core.runtime.whenIdle();
      await f.send('Anything else?', (run) => {
        try {
          return run.triage!.resolve({ ids: ['human-1'], outcome: 'done' });
        } catch (error) {
          return (error as Error).message;
        }
      });
      expect(f.results[0]).toMatch(/matches several items/);
    } finally {
      await f.close();
    }
  }, 60000);

  it('leaves a stalled item alone until something new arrives', async () => {
    const f = await fixture({ triageContinuation: true });
    try {
      await f.send('Waiting on legal');
      expect(f.runs).toHaveLength(2);
      await f.send('FYI lunch is at noon', (run) =>
        run.triage!.resolve({ ids: run.triage!.current(), outcome: 'done' }),
      );
      expect(f.runs).toHaveLength(3);
      await f.send('Also waiting on finance');
      expect(f.runs).toHaveLength(5);
      expect(f.runs.at(-1)!.message).toContain('[Triage] 2 items are still open');
    } finally {
      await f.close();
    }
  }, 60000);
});
