import { expect, it } from 'vitest';
import { loadOverviewMemory, type BridgeCall } from '../src/client/bridge.js';

const days = [
  '2026-09-26',
  '2026-09-27',
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
  '2026-10-02',
];
const result = {
  start: days[0],
  end: days[6],
  days,
  timezone: 'Asia/Tokyo',
  readAt: '2026-10-02T12:00:00Z',
  nextRefreshAt: '2026-10-03T00:00:00Z',
  bots: [{ slug: 'ada', displayName: 'Ada', state: 'unavailable' }],
};
it('loads the bounded Memory projection and rejects invented zero or dirty state on unavailable data', async () => {
  const call: BridgeCall = async (endpoint, args) => {
    expect(endpoint).toBe('overviewMemory');
    expect(args).toEqual({ after: 'ada' });
    return { ok: true, value: result };
  };
  expect(await loadOverviewMemory(call, 'ada')).toEqual(result);
  const invalid: BridgeCall = async () => ({
    ok: true,
    value: { ...result, bots: [{ ...result.bots[0], total: 0, dirty: false }] },
  });
  await expect(loadOverviewMemory(invalid)).rejects.toThrow(
    'overviewMemory returned an unreadable Memory overview.',
  );
});
