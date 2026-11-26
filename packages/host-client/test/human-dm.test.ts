import { expect, it, vi } from 'vitest';
import { HostAnswerInvalid } from '../src/host-answer';
import { filterTeamPeople, openHumanDm, readTeamDirectory } from '../src/human-dm';

const host = (value: unknown) => ({ call: vi.fn().mockResolvedValue(value) });
const bob = { humanId: 'bob', displayName: 'Bob' };

it('reads the Team directory and drops malformed people', async () => {
  const directory = host([bob, { humanId: '', displayName: 'Nobody' }, { humanId: 'eve' }]);
  await expect(readTeamDirectory(directory)).resolves.toEqual([bob]);
  expect(directory.call).toHaveBeenCalledWith('teamDirectory', {});
  await expect(readTeamDirectory(host({ items: [bob] }))).resolves.toEqual([bob]);
  await expect(readTeamDirectory(host({ people: [] }))).rejects.toBeInstanceOf(HostAnswerInvalid);
});

it('opens the Human DM by person and names it from the Host or the directory', async () => {
  const named = host({ channel: { id: 'dm-humans-1', type: 'dm', name: 'Bobby' } });
  await expect(openHumanDm(named, bob)).resolves.toEqual({
    channelId: 'dm-humans-1',
    name: 'Bobby',
  });
  expect(named.call).toHaveBeenCalledWith('humanDm', { humanId: 'bob' });
  await expect(
    openHumanDm(host({ channel: { id: 'dm-humans-1', name: '' } }), bob),
  ).resolves.toEqual({ channelId: 'dm-humans-1', name: 'Bob' });
  await expect(openHumanDm(host({ channelId: 'dm-2' }), { humanId: 'bob' })).resolves.toEqual({
    channelId: 'dm-2',
    name: '',
  });
  await expect(openHumanDm(host({ channel: {} }), bob)).rejects.toBeInstanceOf(HostAnswerInvalid);
});

it('filters people by display name regardless of case and spacing', () => {
  const people = [bob, { humanId: 'ada', displayName: 'Ada Lovelace' }];
  expect(filterTeamPeople(people, '  LOVE ')).toEqual([people[1]]);
  expect(filterTeamPeople(people, '')).toEqual(people);
  expect(filterTeamPeople(people, 'zed')).toEqual([]);
});
