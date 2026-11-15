import { describe, expect, it } from 'vitest';

import { createHostClient } from '@botharness/host-client/client';
import {
  botRoutines,
  newRoutineForm,
  normalTime,
  routineFormOf,
  routineProblem,
  routineTriggerOf,
  type RoutineForm,
} from '../src/host/routines';
import type { BotScheduleSummary } from '@botharness/host-protocol/wire';
import { t } from '../src/ui/strings';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';
import profileWire from './fixtures/profile-wire.json';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const slug = profileWire.bot.slug;
const [digest, hourly] = profileWire.rpc.scheduleList.schedules as BotScheduleSummary[];
const firing = {
  id: 'firing-1',
  scheduleId: digest!.id,
  trigger: 'manual',
  occurrenceAt: '2026-10-15T14:00:00.000Z',
  firedAt: '2026-10-15T14:00:00.000Z',
  state: 'pending',
};

function client(fake: FakeHost) {
  return createHostClient({ routes: [ROUTE], credential: fake.credential, carrier: fake.carrier });
}

function host(): FakeHost {
  const fake = new FakeHost();
  fake.methods.set('scheduleList', () => structuredClone(profileWire.rpc.scheduleList));
  fake.methods.set('scheduleHistory', () => ({ firings: [firing] }));
  fake.methods.set('scheduleRunNow', () => ({ firing }));
  fake.methods.set('scheduleUpdate', (args) => ({
    schedule: { ...digest, ...(args['change'] as object) },
  }));
  fake.methods.set('scheduleDelete', () => ({ removed: true }));
  fake.methods.set('schedulePreview', () => ({
    occurrences: ['2026-10-16T00:00:00.000Z', '2026-10-17T00:00:00.000Z'],
  }));
  fake.methods.set('scheduleCreate', (args) => ({
    schedule: { id: 'new-1', enabled: true, ...(args['input'] as object) },
  }));
  return fake;
}

const form = (patch: Partial<RoutineForm>): RoutineForm => ({
  ...newRoutineForm('Asia/Tokyo'),
  title: 'Standup notes',
  prompt: 'Summarize yesterday',
  ...patch,
});

describe('Routines on the Host', () => {
  it('calls each Bot Schedule method with the named arguments of the Host remote methods', async () => {
    const fake = host();
    const routines = botRoutines(client(fake), slug);

    expect(await routines.list()).toEqual(profileWire.rpc.scheduleList.schedules);
    expect(await routines.history(digest!.id)).toEqual([firing]);
    expect(await routines.runNow(digest!.id)).toEqual(firing);
    expect((await routines.setEnabled(digest!.id, false)).enabled).toBe(false);
    await routines.remove(hourly!.id);
    expect(
      await routines.preview({ kind: 'daily', time: '09:00', timeZone: 'Asia/Tokyo' }),
    ).toEqual(['2026-10-16T00:00:00.000Z', '2026-10-17T00:00:00.000Z']);
    const created = await routines.create(form({ title: '  Standup notes ', time: '8:30' }));
    expect(created.id).toBe('new-1');
    await routines.update(digest!.id, form({ cadence: 'hours', hours: '6' }));

    expect(fake.calls.map((call) => [call.method, call.args])).toEqual([
      ['scheduleList', { slug }],
      ['scheduleHistory', { slug, id: digest!.id }],
      ['scheduleRunNow', { slug, id: digest!.id }],
      ['scheduleUpdate', { slug, id: digest!.id, change: { enabled: false } }],
      ['scheduleDelete', { slug, id: hourly!.id }],
      ['schedulePreview', { trigger: { kind: 'daily', time: '09:00', timeZone: 'Asia/Tokyo' } }],
      [
        'scheduleCreate',
        {
          slug,
          input: {
            title: 'Standup notes',
            prompt: 'Summarize yesterday',
            trigger: { kind: 'daily', time: '08:30', timeZone: 'Asia/Tokyo' },
          },
        },
      ],
      [
        'scheduleUpdate',
        {
          slug,
          id: digest!.id,
          change: {
            title: 'Standup notes',
            prompt: 'Summarize yesterday',
            trigger: { kind: 'every', everySeconds: 6 * 3600 },
          },
        },
      ],
    ]);
  });

  it('refuses to send an incomplete routine', async () => {
    const fake = host();
    await expect(botRoutines(client(fake), slug).create(form({ prompt: ' ' }))).rejects.toThrow();
    expect(fake.calls).toEqual([]);
  });
});

describe('Routine form', () => {
  it('reads daily, weekly and whole-hour routines, and leaves other triggers to the full client', () => {
    expect(routineFormOf(digest!)).toMatchObject({
      title: 'Morning digest',
      prompt: 'Summarize new papers',
      cadence: 'daily',
      time: '09:00',
      timeZone: 'Asia/Tokyo',
    });
    expect(routineFormOf(hourly!)).toMatchObject({ cadence: 'hours', hours: '1' });
    expect(
      routineFormOf({
        ...digest!,
        trigger: { kind: 'weekly', time: '07:15', timeZone: 'UTC', weekdays: [6, 7] },
      }),
    ).toMatchObject({ cadence: 'weekly', time: '07:15', weekdays: [6, 7], timeZone: 'UTC' });
    expect(routineFormOf({ ...digest!, trigger: { kind: 'every', everySeconds: 900 } })).toBe(
      undefined,
    );
    expect(
      routineFormOf({
        ...digest!,
        trigger: { kind: 'cron', expression: '0 9 * * 1', timeZone: 'UTC' },
      }),
    ).toBe(undefined);
  });

  it('builds the trigger only once the schedule is complete, with ISO weekdays', () => {
    expect(routineTriggerOf(form({ cadence: 'weekly', weekdays: [7, 1, 1] }))).toEqual({
      kind: 'weekly',
      time: '09:00',
      timeZone: 'Asia/Tokyo',
      weekdays: [1, 7],
    });
    expect(routineTriggerOf(form({ cadence: 'weekly', weekdays: [] }))).toBe(undefined);
    expect(routineTriggerOf(form({ time: '25:00' }))).toBe(undefined);
    expect(routineTriggerOf(form({ cadence: 'hours', hours: '0' }))).toBe(undefined);
    expect(routineTriggerOf(form({ cadence: 'hours', hours: '1.5' }))).toBe(undefined);
    expect(normalTime(' 7:05 ')).toBe('07:05');
  });

  it('names the first thing missing', () => {
    expect(routineProblem(newRoutineForm('UTC'))).toBe('title');
    expect(routineProblem(form({ prompt: '' }))).toBe('prompt');
    expect(routineProblem(form({ time: '9' }))).toBe('time');
    expect(routineProblem(form({ cadence: 'weekly', weekdays: [] }))).toBe('weekdays');
    expect(routineProblem(form({ cadence: 'hours', hours: '200' }))).toBe('hours');
    expect(routineProblem(form({}))).toBe(undefined);
  });

  it('names Sunday from either weekday numbering', () => {
    expect(t.routineWeekly('09:00', [1, 7])).toBe(t.routineWeekly('09:00', [1, 0]));
  });
});
