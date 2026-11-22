import { expect, it, vi } from 'vitest';
import { applyRosterBatch, readRoster } from '../src/roster-readers';
import { HostAnswerInvalid } from '../src/host-answer';

const host = (value: unknown) => ({ call: vi.fn().mockResolvedValue(value) });
const roster = {
  pins: [],
  hidden: [],
  sections: [{ id: 'work', name: 'Work', channelIds: ['dm-tea'] }],
  sectionOrder: ['work'],
};

it.each([
  (value: unknown) => readRoster(host(value)),
  (value: unknown) => applyRosterBatch(host(value), { action: 'pin', channelIds: ['dm-tea'] }),
])('reads the roster and validates optional mute and ordering fields', async (read) => {
  await expect(read(roster)).resolves.toEqual(roster);
  const ordered = { ...roster, muted: ['dm-tea'], topOrder: [{ kind: 'section', id: 'work' }] };
  await expect(read(ordered)).resolves.toEqual(ordered);
  for (const change of [
    { hidden: undefined },
    { sectionOrder: 'work' },
    { muted: [2] },
    { topOrder: [{ kind: 'unknown', id: 'work' }] },
    { sections: [{ id: 'a', name: 'Work', channelIds: null }] },
  ])
    await expect(read({ ...roster, ...change })).rejects.toBeInstanceOf(HostAnswerInvalid);
});
