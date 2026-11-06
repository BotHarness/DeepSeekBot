import { expect, it } from 'vitest';

import { dismissResolved, parsePushResolved } from '../src/host/push-resolve';

it('reads the resolved items from every shape a background push arrives in', () => {
  const payload = { v: 1, hostId: 'h1', resolved: ['approval:1', '', 3, 'reply:2'] };
  const expected = { hostId: 'h1', itemIds: ['approval:1', 'reply:2'] };
  expect(parsePushResolved({ data: { body: payload } })).toEqual(expected);
  expect(parsePushResolved({ data: { body: JSON.stringify(payload) } })).toEqual(expected);
  expect(parsePushResolved({ data: { dataString: JSON.stringify(payload) } })).toEqual(expected);
  expect(parsePushResolved({ data: payload })).toEqual(expected);
  expect(parsePushResolved({ data: { v: 1, hostId: 'h1' } })).toBeUndefined();
  expect(parsePushResolved({ data: { v: 1, hostId: 'h1', resolved: [] } })).toBeUndefined();
  expect(parsePushResolved({ data: { dataString: '{' } })).toBeUndefined();
  expect(parsePushResolved(undefined)).toBeUndefined();
});

it('withdraws only the shown notifications of the resolved items from that Computer', async () => {
  const dismissed: string[] = [];
  const port = {
    presented: async () => [
      { id: 'n1', data: { v: 1, hostId: 'h1', itemId: 'approval:1' } },
      { id: 'n2', data: { v: 1, hostId: 'h1', itemId: 'approval:9' } },
      { id: 'n3', data: { v: 1, hostId: 'h2', itemId: 'approval:1' } },
      { id: 'n4', data: { v: 1, hostId: 'h1' } },
    ],
    dismiss: async (id: string) => {
      dismissed.push(id);
    },
  };
  expect(await dismissResolved(port, { hostId: 'h1', itemIds: ['approval:1'] })).toBe(1);
  expect(dismissed).toEqual(['n1']);
});
