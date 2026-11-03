import { describe, expect, it } from 'vitest';
import { connectionSummary } from '../src/host/connection-summary';
import type { HumanAttentionItem } from '../src/host/wire';
import type { InboxSnapshot } from '../src/host/inbox';
import type { HostSnapshot } from '../src/host/client';

const request = (id: string, botSlug = 'same'): HumanAttentionItem => ({
  id,
  botSlug,
  kind: 'user-question',
  category: 'action',
  channelId: 'group:shared',
  createdAt: '2026-11-03T00:00:00Z',
  summary: 'Question',
});
function host(hostId = 'a'): {
  hostId: string;
  enabled: boolean;
  snapshot: HostSnapshot;
  attention: InboxSnapshot;
} {
  const snapshot: HostSnapshot = {
    connection: { status: 'connected', route: '' },
    activity: [{ slug: 'same', state: 'waiting', active: true }],
  };
  const attention: InboxSnapshot = {
    status: 'ready',
    sections: { action: [], replies: [], unread: [], handled: [] },
    notificationItems: [request('one'), request('two')],
  };
  return { hostId, enabled: true, snapshot, attention };
}

describe('device connection summary', () => {
  it('counts Bots independently across Hosts, including active Bots waiting on another request', () => {
    const a = host();
    const b = host('b');
    expect(connectionSummary([a, b, a])).toEqual({
      hosts: 2,
      connected: 2,
      synced: 2,
      active: 2,
      needsYou: 2,
    });
  });
  it('uses the complete action projection beyond UI windows and excludes ordinary unread/replies', () => {
    const a = host();
    a.attention = {
      status: 'ready',
      sections: { action: [request('first')], replies: [], unread: [], handled: [] },
      notificationItems: [
        ...Array.from({ length: 251 }, (_, i) => request(String(i), `bot-${i}`)),
        { ...request('reply', 'ordinary'), category: 'replies', kind: 'channel-reply' },
        { ...request('unread', 'unread'), category: 'unread', kind: 'channel-unread' },
      ],
    };
    expect(connectionSummary([a]).needsYou).toBe(251);
  });
  it('keeps connected separate from synced and discards disconnected cached counts', () => {
    const a = host();
    const b = host('b');
    b.snapshot.connection = { status: 'unreachable', route: '', attempt: 1, reason: 'offline' };
    expect(connectionSummary([a, b])).toEqual({
      hosts: 2,
      connected: 1,
      synced: 1,
      active: 1,
      needsYou: 1,
    });
    a.attention = { status: 'loading' };
    expect(connectionSummary([a, b])).toEqual({
      hosts: 2,
      connected: 1,
      synced: 0,
      active: 0,
      needsYou: 0,
    });
  });
  it('does not infer a current zero from an old Host or incomplete notification scan', () => {
    const a = host();
    a.snapshot.activity = [{ slug: 'same', state: 'idle' }];
    expect(connectionSummary([a]).synced).toBe(0);
    a.snapshot.activity = [];
    a.attention = {
      status: 'ready',
      sections: { action: [], replies: [], unread: [], handled: [] },
    };
    expect(connectionSummary([a]).synced).toBe(0);
    a.attention = { ...a.attention, notificationItems: [], stale: 'offline' };
    expect(connectionSummary([a]).synced).toBe(0);
  });
  it('omits opted-out Hosts but retains refused Hosts within their enabled scope', () => {
    const a = host();
    a.enabled = false;
    const b = host('b');
    b.snapshot.connection = {
      status: 'refused',
      route: '',
      code: 'device-revoked',
      reason: 'revoked',
    };
    expect(connectionSummary([a, b])).toEqual({
      hosts: 1,
      connected: 0,
      synced: 0,
      active: 0,
      needsYou: 0,
    });
  });
});
