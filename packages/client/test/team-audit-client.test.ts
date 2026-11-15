import { describe, expect, it, vi } from 'vitest';

import {
  loadAuditLog,
  loadPrivateObjects,
  loadPrivatePage,
  openPrivateContent,
  parsePrivateObject,
} from '../src/client/team-audit-bridge.js';

describe('private content audit client', () => {
  it('keeps only known private object kinds', () => {
    expect(parsePrivateObject({ objectId: 'b1', kind: 'bot', name: 'Helper' })).toEqual({
      objectId: 'b1',
      kind: 'bot',
      name: 'Helper',
      ownerNames: [],
    });
    expect(
      parsePrivateObject({ objectId: 'd1', kind: 'dm', name: 'Diary', ownerNames: ['Bob', 7] }),
    ).toEqual({ objectId: 'd1', kind: 'dm', name: 'Diary', ownerNames: ['Bob'] });
    expect(parsePrivateObject({ objectId: 'x', kind: 'file' })).toBeUndefined();
  });

  it('opens a view with an optional trimmed reason and reads its messages', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      value: {
        viewId: 'v1',
        messages: [
          {
            id: 'm1',
            at: '2026-11-15T00:00:00.000Z',
            author: { kind: 'human', displayName: 'Bob' },
            body: 'hi',
          },
        ],
      },
    }));
    const view = await openPrivateContent(
      call,
      { objectId: 'c1', kind: 'channel', name: 'Ops', ownerNames: [] },
      '  incident  ',
    );
    expect(call).toHaveBeenCalledWith(
      'privateContentOpen',
      { kind: 'channel', objectId: 'c1', reason: 'incident' },
      undefined,
    );
    expect(view.messages).toEqual([
      { id: 'm1', at: '2026-11-15T00:00:00.000Z', author: 'Bob', body: 'hi' },
    ]);
  });

  it('reads audit records from a page', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      value: {
        items: [
          { auditId: 'a1', at: 'now', viewerName: 'Owner', kind: 'dm', objectName: 'Bob · Alice' },
          { auditId: 'bad' },
        ],
      },
    }));
    const page = await loadAuditLog(call, undefined);
    expect(page.records.map((row) => row.auditId)).toEqual(['a1']);
    expect(page.next).toBeUndefined();
    expect(call).toHaveBeenCalledWith('auditLog', { limit: 50 }, undefined);
  });

  it('follows the audit cursor to the next page', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      value: {
        records: [{ auditId: 'a51', at: 'now', viewerName: 'Owner', kind: 'bot', objectName: 'D' }],
        next: 'a51',
      },
    }));
    const page = await loadAuditLog(call, 'a50');
    expect(call).toHaveBeenCalledWith('auditLog', { limit: 50, after: 'a50' }, undefined);
    expect(page.next).toBe('a51');
  });

  it('lists every member when no member is chosen and pages earlier messages', async () => {
    const call = vi.fn(async (method: string) => ({
      ok: true as const,
      value:
        method === 'privateObjects'
          ? [{ objectId: 'b1', kind: 'bot', name: 'Diary', ownerNames: ['Bob'] }]
          : {
              messages: [
                {
                  id: 'm0',
                  at: 'then',
                  author: { kind: 'bot', displayName: 'Diary' },
                  body: 'old',
                },
              ],
            },
    }));
    expect((await loadPrivateObjects(call, undefined))[0]?.ownerNames).toEqual(['Bob']);
    expect(call).toHaveBeenCalledWith('privateObjects', {}, undefined);
    expect(await loadPrivatePage(call, 'v1', 'm1')).toEqual([
      { id: 'm0', at: 'then', author: 'Diary', body: 'old' },
    ]);
    expect(call).toHaveBeenCalledWith(
      'privateContentPage',
      { viewId: 'v1', before: 'm1' },
      undefined,
    );
  });
});
