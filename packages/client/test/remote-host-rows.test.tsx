import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RemoteHost } from '../src/client/remote-hosts.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: () => null,
  Modal: () => null,
  Input: () => null,
  Textarea: () => null,
  Tooltip: ({ children }: { children?: import('react').ReactNode }) => children,
}));

const fixture = vi.hoisted(() => ({
  hosts: [] as RemoteHost[],
  avatars: new Map<string, string>(),
}));
vi.mock('../src/client/remote-hosts.js', async (original) => ({
  ...(await original<typeof import('../src/client/remote-hosts.js')>()),
  remoteHosts: () => ({
    getSnapshot: () => ({ hosts: fixture.hosts, avatars: fixture.avatars, tab: 'all' }),
    subscribe: () => () => {},
  }),
}));

import { RemoteHostRows } from '../src/client/host-tabs.js';
import { EnvironmentFilter, EnvironmentPanel } from '../src/client/environment-panel.js';
import { zhTranslate } from '../src/client/locale.js';
import { bindTobPresentation } from '../src/client/tob-presentation.js';
import * as hostLooks from '../src/client/host-looks.js';

afterEach(() => vi.unstubAllGlobals());

it.each(['member', 'admin'])('hides Owner environment surfaces from the %s page', (role) => {
  vi.stubGlobal('__DSH_REMOTE_ACCESS__', { owner: false, role });
  const read = vi.fn(() => {
    throw new Error('Owner storage must not be read');
  });
  vi.stubGlobal('localStorage', { getItem: read });
  const look = vi.spyOn(hostLooks, 'useHostLook');
  const name = vi.spyOn(hostLooks, 'useHostName');
  try {
    expect(renderToStaticMarkup(createElement(EnvironmentPanel, { t: zhTranslate }))).toBe('');
    expect(renderToStaticMarkup(createElement(EnvironmentFilter, { t: zhTranslate }))).toBe('');
    expect(read).not.toHaveBeenCalled();
    expect(look).not.toHaveBeenCalled();
    expect(name).not.toHaveBeenCalled();
  } finally {
    look.mockRestore();
    name.mockRestore();
  }
});

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
          slug: 'tob',
          displayName: 'Ada',
          roles: [],
          state: 'working',
          computerAccess: false,
          browserAccess: false,
          paused: false,
          dmChannelId: 'private-ada',
          avatarUrl: 'https://studio.example/avatar/tob',
          preview: 'Studio preview',
        },
      ],
      channels: [{ id: 'group', name: 'Team', members: ['tob'], memberCount: 1 }],
    },
  },
  inbox: {
    status: 'ready',
    sections: { action: [], replies: [], unread: [], handled: [] },
    unread: { 'private-ada': 2, group: 3 },
  },
  activity: new Map([
    [
      'tob',
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
    fixture.avatars = new Map([['https://studio.example/avatar/tob', 'blob:studio-tob']]);
    const html = renderToStaticMarkup(
      createElement(RemoteHostRows, { remote, query: '', showSource: true, t: zhTranslate }),
    );
    expect(html).toContain('data-state="working"');
    expect(html).toContain('data-effect="coding"');
    expect(html).toContain('2 条未读');
    expect(html).toContain('3 条未读');
    expect(html.match(/bh-unread-corner/g)).toHaveLength(2);
    expect(html).toContain('bh-group-avatar-stack');
    expect(html.match(/src="blob:studio-tob"/g)).toHaveLength(2);
    expect(html).toContain('Studio preview');
    expect(html).toContain('data-remote-host-mark="studio"');
  });

  it('keeps each Host portrait, activity and unread together for equal Bot slugs without local lookup', () => {
    const other: RemoteHost = {
      ...remote,
      host: { ...remote.host, hostId: 'lab', hostName: 'Lab' },
      snapshot: {
        ...remote.snapshot,
        roster: {
          bots: [
            {
              ...remote.snapshot.roster!.bots[0]!,
              state: 'idle',
              avatarUrl: 'https://lab.example/avatar/tob',
              preview: 'Lab preview',
            },
          ],
          channels: [],
        },
      },
      inbox: {
        status: 'ready',
        sections: { action: [], replies: [], unread: [], handled: [] },
        unread: { 'private-ada': 7 },
      },
      activity: new Map([['tob', { state: 'idle' }]]),
    };
    fixture.hosts = [remote, other];
    fixture.avatars = new Map([
      ['https://studio.example/avatar/tob', 'blob:studio-tob'],
      ['https://lab.example/avatar/tob', 'blob:lab-tob'],
    ]);
    const local = vi.fn(() => undefined);
    const release = bindTobPresentation({
      bot: local,
      icon: () => 'bot',
      subscribe: () => () => {},
    });
    try {
      const render = (host: RemoteHost) =>
        renderToStaticMarkup(
          createElement(RemoteHostRows, {
            remote: host,
            query: '',
            showSource: true,
            t: zhTranslate,
          }),
        );
      const studio = render(remote);
      const lab = render(other);
      expect(studio).toContain('src="blob:studio-tob"');
      expect(studio).not.toContain('blob:lab-tob');
      expect(studio).toContain('data-effect="coding"');
      expect(studio).toContain('2 条未读');
      expect(lab).toContain('src="blob:lab-tob"');
      expect(lab).not.toContain('blob:studio-tob');
      expect(lab).toContain('data-state="idle"');
      expect(lab).not.toContain('data-effect="coding"');
      expect(lab).toContain('7 条未读');
      expect(lab).toContain('Lab preview');
      expect(lab).toContain('data-remote-host-mark="lab"');
      expect(local).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });
});
