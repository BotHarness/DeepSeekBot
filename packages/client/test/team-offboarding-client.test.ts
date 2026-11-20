import { describe, expect, it, vi } from 'vitest';

import { parseChannelMessage } from '../src/client/bridge.js';
import { changeOwnPassword, parseTeamMember } from '../src/client/team-bridge.js';
import {
  confirmPurge,
  loadPurgePreview,
  loadTransferPreview,
  resetMemberPassword,
} from '../src/client/team-offboarding-bridge.js';

describe('Team offboarding bridge', () => {
  it('requires the new one-time password on reset', async () => {
    await expect(resetMemberPassword(async () => ({ ok: true, value: {} }), 'h')).rejects.toThrow();
    expect(
      await resetMemberPassword(
        async () => ({ ok: true, value: { initialPassword: 'once-123' } }),
        'h',
      ),
    ).toBe('once-123');
  });

  it('keeps only well-formed transfer rows and safe purge counts', async () => {
    const preview = await loadTransferPreview(
      async () => ({
        ok: true,
        value: {
          channels: [{ channelId: 'c', name: 'Ops' }, { name: 'x' }],
          bots: [{ slug: 'b', displayName: 'B' }],
        },
      }),
      'h',
    );
    expect(preview).toEqual({
      channels: [{ channelId: 'c', name: 'Ops' }],
      bots: [{ slug: 'b', displayName: 'B' }],
    });
    const purge = await loadPurgePreview(
      async () => ({
        ok: true,
        value: { token: 't', counts: { channels: 2, bots: -1, messages: 'x' } },
      }),
      'h',
    );
    expect(purge.counts).toEqual({ channels: 2, bots: 0, messages: 0, files: 0 });
  });

  it('sends the typed username with the purge token and the sign-out choice', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: null }));
    await confirmPurge(call, { humanId: 'h', token: 't', username: 'bob' });
    expect(call).toHaveBeenLastCalledWith(
      'memberPurgeConfirm',
      { humanId: 'h', token: 't', username: 'bob' },
      undefined,
    );
    await changeOwnPassword(call, 'a', 'b', false);
    expect(call).toHaveBeenLastCalledWith(
      'memberPasswordChange',
      { current: 'a', next: 'b', signOutOthers: false },
      undefined,
    );
  });

  it('reads deactivated members and deleted authors', () => {
    expect(parseTeamMember({ humanId: 'h', username: 'bob', status: 'deactivated' })?.status).toBe(
      'deactivated',
    );
    const message = parseChannelMessage({
      id: 'm',
      at: '2026-11-14T00:00:00Z',
      body: 'x',
      author: { kind: 'human', humanId: 'h', deleted: true },
    });
    expect(message?.author).toEqual({ kind: 'human', humanId: 'h', deleted: true });
  });
});
