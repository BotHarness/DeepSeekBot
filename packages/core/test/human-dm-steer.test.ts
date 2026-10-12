import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

describe('Human DM steering', () => {
  it.each(['accepted', 'refused', 'throws'])(
    'grants private interaction to a scheduled turn only when Human steering is %s',
    async (outcome) => {
      let ready!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let sessionId = '';
      const core = createCore({
        dshHome: createTempRoot('bh-schedule-steer-private-'),
        agents: {
          async runOrchestrator(run) {
            sessionId = run.sessionId;
            ready();
            await held;
          },
          steerOrchestrator() {
            expect(core.runtime.canRequestPrivateInput?.(sessionId)).toBe(false);
            if (outcome === 'throws') throw new Error('Steering refused with an exception');
            return outcome === 'accepted';
          },
          async runAssignment() {},
          requestAssignment() {
            throw new Error('No Assignment expected');
          },
          async close() {},
        },
      });
      try {
        core.registry.create({ slug: 'ada', displayName: 'Ada' });
        const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
        const schedule = core.schedules.create(
          'ada',
          {
            title: 'Background check',
            prompt: 'Use a private account',
            trigger: { kind: 'every', everySeconds: 3600 },
            enabled: false,
          },
          'human',
        );
        core.schedules.runNow('ada', schedule.id);
        await started;
        expect(core.runtime.canRequestPrivateInput?.(sessionId)).toBe(false);
        await core.channels.appendMessage(dm.id, {
          id: 'steered-human',
          at: new Date().toISOString(),
          author: { kind: 'human' },
          body: 'Configure the account',
        });
        core.runtime.admitDmMessage({
          channelId: dm.id,
          messageId: 'steered-human',
          body: 'Configure the account',
        });
        expect(core.runtime.canRequestPrivateInput?.(sessionId)).toBe(outcome === 'accepted');
      } finally {
        release();
        core.schedules.close();
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );

  it.each(['accepted', 'refused', 'interrupted', 'admission-failed'])(
    'observes an external Memory edit when active steering is %s',
    async (outcome) => {
      let markStarted = (): void => undefined;
      let releaseTurn = (): void => undefined;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const released = new Promise<void>((resolve) => {
        releaseTurn = resolve;
      });
      const inboxes: string[] = [];
      const steered: string[] = [];
      const agents: BotAgentAdapter = {
        async runOrchestrator(run) {
          inboxes.push(run.inbox);
          if (inboxes.length === 1) {
            markStarted();
            await released;
            if (outcome === 'interrupted') throw new Error('Interrupted active Turn');
          }
        },
        steerOrchestrator(_slug, text) {
          steered.push(text);
          return outcome !== 'refused';
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      };
      const core = createCore({ dshHome: createTempRoot('botharness-steer-memory-'), agents });
      try {
        core.registry.create({ slug: 'ada', displayName: 'Ada' });
        const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
        const send = async (id: string) => {
          await core.channels.appendMessage(dm.id, {
            id,
            at: '2026-10-01T00:00:00.000Z',
            author: { kind: 'human' },
            body: id,
          });
          return core.runtime.admitDmMessage({ channelId: dm.id, messageId: id, body: id });
        };
        await send('first');
        await started;
        writeFileSync(
          join(core.registry.memoryDirFor('ada')!, 'external.md'),
          'External private content\n',
        );
        const port = attachOperationalModule(core.operationalDatabase, 'steer-memory-test');
        if (outcome === 'admission-failed')
          port.transaction((db) =>
            db.exec(`
        CREATE TRIGGER reject_steered_memory BEFORE INSERT ON inbox_admissions
        WHEN NEW.reason = 'memory-change'
        BEGIN SELECT RAISE(ABORT, 'simulated admission failure'); END;
      `),
          );
        await send('steered');
        expect(inboxes).toHaveLength(1);
        const items = () =>
          core.attention
            .list({ botSlug: 'ada' })
            .items.filter((item) => item.reason === 'memory-change');
        if (outcome === 'admission-failed') {
          expect(steered).toHaveLength(0);
          expect(items()).toHaveLength(0);
          port.transaction((db) => db.exec('DROP TRIGGER reject_steered_memory'));
        } else {
          expect(steered[0]).toContain('external.md');
          expect(steered[0]).not.toContain('External private content');
          expect(items()[0]?.state).toBe(outcome === 'refused' ? 'pending' : 'processing');
        }
        if (outcome === 'accepted') {
          await send('steered-again');
          expect(steered).toHaveLength(2);
          expect(steered[1]).not.toContain('external.md');
        }
        releaseTurn();
        await core.runtime.whenIdle();
        await send('next-turn');
        await core.runtime.whenIdle();
        expect(inboxes).toHaveLength(outcome === 'refused' ? 3 : 2);
        if (outcome === 'accepted') expect(inboxes[1]).not.toContain('external.md');
        else expect(inboxes[1]).toContain('external.md');
        expect(inboxes.join('')).not.toContain('External private content');
        expect(
          core.attention
            .list({ botSlug: 'ada' })
            .items.filter((item) => item.reason === 'memory-change'),
        ).toHaveLength(1);
        expect(
          core.attention
            .list({ botSlug: 'ada' })
            .items.find((item) => item.reason === 'memory-change')?.state,
        ).toBe('handled');
      } finally {
        releaseTurn();
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );

  it('steers a Human DM message into an active Orchestrator turn at its next safe step', async () => {
    const home = createTempRoot('botharness-dm-steer-');
    let markStarted = (): void => undefined;
    let releaseTurn = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const steered: string[] = [];
    const runs: string[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        if (run.inboundChannelId === undefined) throw new Error('Expected local inbound Channel');
        runs.push(run.inboundChannelId);
        markStarted();
        await released;
      },
      steerOrchestrator(botSlug, text) {
        expect(botSlug).toBe('ada');
        steered.push(text);
        return true;
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'dm-1',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Start the report',
      });
      const first = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-1',
        body: 'Start the report',
      });
      expect(first.admitted).toBe(true);
      await started;

      await core.channels.appendMessage(dm.id, {
        id: 'dm-2',
        at: '2026-09-25T00:00:01.000Z',
        author: { kind: 'human' },
        body: 'STEER-42 use the second file',
      });
      const second = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-2',
        body: 'STEER-42 use the second file',
      });
      expect(second.admitted).toBe(true);

      expect(steered).toHaveLength(1);
      expect(steered[0]).toContain('STEER-42 use the second file');
      expect(core.channels.message(dm.id, 'dm-2')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'running' },
      ]);

      releaseTurn();
      if (first.admitted) await first.settled;
      await core.runtime.whenIdle();
      expect(runs).toEqual([dm.id]);
      expect(core.channels.message(dm.id, 'dm-2')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'handled' },
      ]);
    } finally {
      releaseTurn();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('admits a Human DM message as its own turn when delivery is turn', async () => {
    const home = createTempRoot('botharness-dm-turn-');
    let markStarted = (): void => undefined;
    let releaseTurn = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const steered: string[] = [];
    const runs: string[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        if (run.inboundChannelId === undefined) throw new Error('Expected local inbound Channel');
        runs.push(run.inboundChannelId);
        if (runs.length === 1) {
          markStarted();
          await released;
        }
      },
      steerOrchestrator(botSlug, text) {
        steered.push(text);
        return true;
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.sourcePolicy.setImmediateDelivery('ada', 'human-dm', 'turn', { kind: 'human' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'dm-1',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Start the report',
      });
      const first = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-1',
        body: 'Start the report',
      });
      expect(first.admitted).toBe(true);
      await started;

      await core.channels.appendMessage(dm.id, {
        id: 'dm-2',
        at: '2026-09-25T00:00:01.000Z',
        author: { kind: 'human' },
        body: 'QUEUE-42 as its own turn',
      });
      const second = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-2',
        body: 'QUEUE-42 as its own turn',
      });
      expect(second.admitted).toBe(true);

      releaseTurn();
      if (first.admitted) await first.settled;
      await core.runtime.whenIdle();
      expect(steered).toEqual([]);
      expect(runs).toEqual([dm.id, dm.id]);
      expect(core.channels.message(dm.id, 'dm-2')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'handled' },
      ]);
    } finally {
      releaseTurn();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('claims pending Human DM messages into the next steer', async () => {
    const home = createTempRoot('botharness-dm-harvest-');
    let markStarted = (): void => undefined;
    let releaseTurn = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const steered: string[] = [];
    let allowSteer = false;
    const agents: BotAgentAdapter = {
      async runOrchestrator() {
        markStarted();
        await released;
      },
      steerOrchestrator(_botSlug, text) {
        if (!allowSteer) return false;
        steered.push(text);
        return true;
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      for (const [id, body] of [
        ['dm-1', 'Start the report'],
        ['dm-2', 'QUEUED-ONE'],
        ['dm-3', 'STEER-TWO'],
      ] as const) {
        await core.channels.appendMessage(dm.id, {
          id,
          at: `2026-09-25T00:00:0${id.slice(-1)}.000Z`,
          author: { kind: 'human' },
          body,
        });
      }
      const first = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-1',
        body: 'Start the report',
      });
      expect(first.admitted).toBe(true);
      await started;

      const second = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-2',
        body: 'QUEUED-ONE',
      });
      expect(second.admitted).toBe(true);
      allowSteer = true;
      const third = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-3',
        body: 'STEER-TWO',
      });
      expect(third.admitted).toBe(true);

      expect(steered).toHaveLength(1);
      expect(steered[0]).toContain('STEER-TWO');
      expect(steered[0]).toContain('QUEUED-ONE');
      expect(steered[0]).toContain('pending DM context');

      releaseTurn();
      await core.runtime.whenIdle();
    } finally {
      releaseTurn();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('folds many short pending Human DM messages up to the character budget', async () => {
    const home = createTempRoot('botharness-dm-burst-');
    let markStarted = (): void => undefined;
    let releaseTurn = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const steered: string[] = [];
    const turns: string[] = [];
    let allowSteer = false;
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        turns.push(String(run.message));
        markStarted();
        await released;
      },
      steerOrchestrator(_botSlug, text) {
        if (!allowSteer) return false;
        steered.push(text);
        return true;
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'dm-0',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Start',
      });
      const first = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-0',
        body: 'Start',
      });
      expect(first.admitted).toBe(true);
      await started;
      for (let index = 0; index < 30; index += 1) {
        const id = `dm-burst-${index}`;
        const body = `SHORT-${index}`;
        await core.channels.appendMessage(dm.id, {
          id,
          at: `2026-09-25T00:01:${String(index).padStart(2, '0')}.000Z`,
          author: { kind: 'human' },
          body,
        });
        expect(
          core.runtime.admitDmMessage({ channelId: dm.id, messageId: id, body }).admitted,
        ).toBe(true);
      }
      allowSteer = true;
      await core.channels.appendMessage(dm.id, {
        id: 'dm-trigger',
        at: '2026-09-25T00:02:00.000Z',
        author: { kind: 'human' },
        body: 'TRIGGER',
      });
      expect(
        core.runtime.admitDmMessage({ channelId: dm.id, messageId: 'dm-trigger', body: 'TRIGGER' })
          .admitted,
      ).toBe(true);
      expect(steered).toHaveLength(1);
      expect(steered[0]).toContain('TRIGGER');
      expect(steered[0]).toContain('SHORT-0');
      expect(steered[0]).toContain('SHORT-29');
      expect(steered[0]).toContain('pending DM context');
      expect(steered[0]).not.toContain('remain pending for later turns');
      releaseTurn();
      await core.runtime.whenIdle();
      expect(turns).toHaveLength(1);
      expect(turns[0]).toContain('Start');
      expect(
        attachOperationalModule(core.operationalDatabase, 'bot-inbox').read((database) =>
          database
            .prepare('SELECT attempt_state, COUNT(*) AS count FROM inbox_admissions GROUP BY 1')
            .all(),
        ),
      ).toEqual([{ attempt_state: 'handled', count: 32 }]);
    } finally {
      releaseTurn();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
