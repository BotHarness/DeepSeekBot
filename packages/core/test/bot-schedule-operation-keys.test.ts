import { describe, expect, it } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import {
  BOT_SCHEDULE_ENABLED_LIMIT,
  createBotScheduleStore,
} from '../src/schedules/bot-schedules.js';
import { storeAt } from './bot-schedule-store-fixture.js';

describe('Bot Schedule operation keys and revisions', () => {
  const hourly = {
    title: 'Check X',
    prompt: 'Look at X',
    trigger: { kind: 'every', everySeconds: 3600 },
  } as const;

  it('reconciles a retried creation whose result was lost instead of adding a second schedule', () => {
    const { store, owner, clock } = storeAt('2026-10-06T00:00:00.000Z');
    const first = store.create('ada', hourly, 'human', undefined, { operationKey: 'tob-op-0001' });
    expect(first.reconciled).toBeUndefined();
    clock.now = new Date('2026-10-06T00:05:00.000Z');
    const restarted = createBotScheduleStore({
      database: attachOperationalModule(owner, 'bot-schedules'),
      isBotActive: () => true,
      onAdmitted: () => {},
      now: () => clock.now,
    });
    const retried = restarted.create(
      'ada',
      { ...hourly, title: '  Check X ' },
      'human',
      undefined,
      { operationKey: 'tob-op-0001' },
    );
    expect(retried).toMatchObject({ id: first.id, revision: first.revision, reconciled: true });
    expect(store.list('ada').map((row) => row.id)).toEqual([first.id]);
  });

  it('reconciles a one-time reminder retried after its time has passed', () => {
    const { store, clock } = storeAt('2026-10-06T00:00:00.000Z');
    const once = {
      title: 'Call',
      prompt: 'Call back',
      trigger: { kind: 'once', date: '2026-10-06', time: '09:30', timeZone: 'Asia/Tokyo' },
    } as const;
    const first = store.create('ada', once, 'human', undefined, { operationKey: 'tob-op-once' });
    clock.now = new Date('2026-10-06T01:00:00.000Z');
    store.tick();
    expect(
      store.create('ada', once, 'human', undefined, { operationKey: 'tob-op-once' }),
    ).toMatchObject({ id: first.id, enabled: false, reconciled: true });
    expect(() =>
      store.create('ada', once, 'human', undefined, { operationKey: 'tob-op-late' }),
    ).toThrow(expect.objectContaining({ code: 'invalid-input' }));
    expect(store.list('ada')).toHaveLength(1);
  });

  it('refuses a one-time retry whose time differs only in seconds', () => {
    const { store } = storeAt('2026-10-06T00:00:00.000Z');
    const once = (time: string) =>
      ({
        title: 'Call',
        prompt: 'Call back',
        trigger: { kind: 'once', date: '2026-10-06', time, timeZone: 'Asia/Tokyo' },
      }) as const;
    store.create('ada', once('09:30:10'), 'human', undefined, { operationKey: 'tob-op-secs' });
    expect(() =>
      store.create('ada', once('09:30:50'), 'human', undefined, { operationKey: 'tob-op-secs' }),
    ).toThrow(expect.objectContaining({ code: 'operation-key-conflict' }));
    expect(
      store.create('ada', once('09:30:10'), 'human', undefined, { operationKey: 'tob-op-secs' }),
    ).toMatchObject({ reconciled: true });
    expect(store.list('ada')).toHaveLength(1);
  });

  it('treats a daily time that differs only in seconds as a different request and revision', () => {
    const { store } = storeAt('2026-10-06T00:00:00.000Z');
    const daily = (time: string) =>
      ({
        title: 'Standup',
        prompt: 'Post the standup',
        trigger: { kind: 'daily', time, timeZone: 'Asia/Tokyo' },
      }) as const;
    const first = store.create('ada', daily('09:00:10'), 'human', undefined, {
      operationKey: 'tob-op-daily',
    });
    expect(() =>
      store.create('ada', daily('09:00:50'), 'human', undefined, { operationKey: 'tob-op-daily' }),
    ).toThrow(expect.objectContaining({ code: 'operation-key-conflict' }));
    const edited = store.update('ada', first.id, { trigger: daily('09:00:50').trigger }, 'human');
    expect(edited.revision).not.toBe(first.revision);
    expect(() => store.update('ada', first.id, { title: 'Late' }, 'human', first.revision)).toThrow(
      expect.objectContaining({ code: 'stale-revision' }),
    );
  });

  it('reconciles at the enabled limit without counting the original twice', () => {
    const { store } = storeAt('2026-10-06T00:00:00.000Z');
    for (let index = 1; index < BOT_SCHEDULE_ENABLED_LIMIT; index += 1)
      store.create('ada', { ...hourly, title: `T${index}` }, 'human');
    const last = store.create('ada', hourly, 'human', undefined, { operationKey: 'tob-op-limit' });
    expect(
      store.create('ada', hourly, 'human', undefined, { operationKey: 'tob-op-limit' }),
    ).toMatchObject({ id: last.id, reconciled: true });
    expect(store.list('ada')).toHaveLength(BOT_SCHEDULE_ENABLED_LIMIT);
  });

  it('refuses a reused key for a different request, another Bot or a malformed key', () => {
    const { store } = storeAt('2026-10-06T00:00:00.000Z');
    store.create('ada', hourly, 'human', undefined, { operationKey: 'tob-op-0002' });
    expect(() =>
      store.create('ada', { ...hourly, prompt: 'Look at Y' }, 'human', undefined, {
        operationKey: 'tob-op-0002',
      }),
    ).toThrow(expect.objectContaining({ code: 'operation-key-conflict' }));
    expect(() =>
      store.create('grace', hourly, 'human', undefined, { operationKey: 'tob-op-0002' }),
    ).toThrow(expect.objectContaining({ code: 'operation-key-conflict' }));
    expect(() =>
      store.create('ada', hourly, 'human', undefined, { operationKey: 'short' }),
    ).toThrow(expect.objectContaining({ code: 'invalid-operation-key' }));
    expect(store.list('ada')).toHaveLength(1);
    expect(store.list('grace')).toEqual([]);
  });

  it('never recreates a schedule whose operation key outlived its deletion', () => {
    const { store } = storeAt('2026-10-06T00:00:00.000Z');
    const created = store.create('ada', hourly, 'human', undefined, {
      operationKey: 'tob-op-0003',
    });
    expect(store.remove('ada', created.id, 'human')).toBe(true);
    expect(() =>
      store.create('ada', hourly, 'human', undefined, { operationKey: 'tob-op-0003' }),
    ).toThrow(expect.objectContaining({ code: 'operation-key-consumed' }));
    expect(store.list('ada')).toEqual([]);
  });

  it('refuses an edit or deletion approved against a stale revision', () => {
    const { store } = storeAt('2026-10-06T00:00:00.000Z');
    const created = store.create('ada', hourly, 'human');
    const edited = store.update('ada', created.id, { title: 'Renamed' }, 'human', created.revision);
    expect(edited.revision).not.toBe(created.revision);
    expect(() =>
      store.update('ada', created.id, { prompt: 'Overwrite' }, 'human', created.revision),
    ).toThrow(expect.objectContaining({ code: 'stale-revision' }));
    expect(() => store.remove('ada', created.id, 'human', created.revision)).toThrow(
      expect.objectContaining({ code: 'stale-revision' }),
    );
    expect(store.list('ada')[0]).toMatchObject({ title: 'Renamed', prompt: 'Look at X' });
    expect(store.remove('ada', created.id, 'human', edited.revision)).toBe(true);
    expect(store.remove('ada', created.id, 'human', edited.revision)).toBe(false);
  });

  it('keeps the revision across firings and Run now bookkeeping', () => {
    const { store, clock } = storeAt('2026-10-06T00:00:00.000Z');
    const created = store.create('ada', hourly, 'human');
    clock.now = new Date('2026-10-06T01:00:00.000Z');
    store.tick();
    store.runNow('ada', created.id);
    const [after] = store.list('ada');
    expect(after?.nextRunAt).toBe('2026-10-06T02:00:00.000Z');
    expect(after?.lastFiring).toBeDefined();
    expect(after?.revision).toBe(created.revision);
    expect(
      store.update('ada', created.id, { enabled: false }, 'human', created.revision).enabled,
    ).toBe(false);
  });
});
