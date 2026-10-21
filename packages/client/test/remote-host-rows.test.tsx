import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RemoteHost } from '../src/client/remote-hosts.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: () => null,
  Modal: () => null,
  Input: () => null,
  Textarea: () => null,
  Tooltip: ({ children }: { children?: import('react').ReactNode }) => children,
}));

const fixture = vi.hoisted(() => ({ hosts: [] as RemoteHost[] }));
vi.mock('../src/client/remote-hosts.js', async (original) => ({
  ...(await original<typeof import('../src/client/remote-hosts.js')>()),
  remoteHosts: () => ({
    getSnapshot: () => ({ hosts: fixture.hosts, avatars: new Map(), tab: 'all' }),
    subscribe: () => () => {},
  }),
}));

import { RemoteHostRows } from '../src/client/host-tabs.js';
import { zhTranslate } from '../src/client/locale.js';

const remote: RemoteHost = {
  host: {
    hostId: 'studio',
    hostName: 'Studio',
    routes: [],
    deviceId: 'browser',
    credential: 'test',
  },
  snapshot: {
    connection: { status: 'stopped', route: '' },
    roster: {
      bots: [
        {
          slug: 'ada',
          displayName: 'Ada',
          roles: [],
          state: 'working',
          computerAccess: false,
          browserAccess: false,
          paused: false,
          dmChannelId: 'private-ada',
        },
      ],
      channels: [{ id: 'group', name: 'Team', members: [], memberCount: 0 }],
    },
  },
  inbox: {
    status: 'ready',
    sections: { action: [], replies: [], unread: [], handled: [] },
    unread: { 'private-ada': 2, group: 3 },
  },
  activity: new Map([
    [
      'ada',
      {
        state: 'working',
        activity: { effect: 'coding', toolKind: 'other', startedAt: 100, activeToolCount: 1 },
      },
    ],
  ]),
};

describe('remote Host rows', () => {
  it('uses the DM channel id and group id for unread badges and the Host activity for the avatar', () => {
    fixture.hosts = [remote];
    const html = renderToStaticMarkup(
      createElement(RemoteHostRows, { remote, query: '', showSource: true, t: zhTranslate }),
    );
    expect(html).toContain('data-state="working"');
    expect(html).toContain('data-effect="coding"');
    expect(html).toContain('2 条未读');
    expect(html).toContain('3 条未读');
    expect(html.match(/bh-unread-corner/g)).toHaveLength(2);
  });

});
