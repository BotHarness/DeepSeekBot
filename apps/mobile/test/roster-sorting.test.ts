import { describe, expect, it } from 'vitest';
import { rosterSortingOf } from '../src/host/roster-sorting';

describe('Host sorting settings projection', () => {
  it('reads only the canonical Web namespace and treats missing overrides as inherit', () => {
    expect(
      rosterSortingOf({
        namespaces: [
          { ns: 'other', value: { sortMode: 'manual' } },
          {
            ns: 'botharness-client',
            value: { sortMode: 'manual', sortModes: { pinned: 'updated' }, developerMode: true },
          },
        ],
      }),
    ).toEqual({ sortMode: 'manual', sortModes: { pinned: 'updated' } });
    expect(rosterSortingOf({ namespaces: [] })).toEqual({ sortMode: 'updated', sortModes: {} });
  });
  it('does not silently turn an invalid read into newest order', () => {
    for (const value of [
      undefined,
      {},
      { namespaces: [{ ns: 'botharness-client', value: { sortMode: 'random' } }] },
      { namespaces: [{ ns: 'botharness-client', value: { sortModes: { work: 'inherit' } } }] },
    ])
      expect(() => rosterSortingOf(value)).toThrow();
  });
});
