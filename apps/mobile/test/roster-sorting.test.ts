import { describe, expect, it } from 'vitest';
import { HostAnswerInvalid } from '@botharness/host-client/host-answer';
import { readRosterSorting } from '@botharness/host-client/roster-sorting';

const host = (value: unknown) => ({ call: async () => value });

describe('Host sorting settings projection', () => {
  it('reads only the canonical Web namespace and treats missing overrides as inherit', async () => {
    await expect(
      readRosterSorting(
        host({
          namespaces: [
            { ns: 'other', value: { sortMode: 'manual' } },
            {
              ns: 'botharness-client',
              value: {
                sortMode: 'manual',
                sortModes: { pinned: 'updated' },
                developerMode: true,
              },
            },
          ],
        }),
      ),
    ).resolves.toEqual({
      sortMode: 'manual',
      sortModes: { pinned: 'updated' },
    });
    await expect(readRosterSorting(host({ namespaces: [] }))).resolves.toEqual({
      sortMode: 'updated',
      sortModes: {},
    });
  });
  it('does not silently turn an invalid read into newest order', async () => {
    for (const value of [undefined, {}])
      await expect(readRosterSorting(host(value))).rejects.toBeInstanceOf(HostAnswerInvalid);
    for (const value of [
      {
        namespaces: [{ ns: 'botharness-client', value: { sortMode: 'random' } }],
      },
      {
        namespaces: [
          {
            ns: 'botharness-client',
            value: { sortModes: { work: 'inherit' } },
          },
        ],
      },
    ])
      await expect(readRosterSorting(host(value))).rejects.toThrow();
  });
});
