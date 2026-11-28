import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { getLinkingConfig } from 'expo-router/build/getLinkingConfig';
import { getRoutes } from 'expo-router/build/getRoutes';
import type { HostClient } from '@botharness/host-client/client';
import type { HumanAttentionItem } from '@botharness/host-protocol/wire';

import { openActivityItem, type InboxHref } from '../src/ui/shell/open-activity-item';

vi.mock(
  '../src/ui/shell/activity-session-route',
  async () => import('../src/ui/shell/activity-session-route.android'),
);

const appDir = fileURLToPath(new URL('../app', import.meta.url));
const files = readdirSync(appDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => `./${file.split('\\').join('/')}`);
const context = Object.assign(() => ({ default: () => null }), {
  keys: () => files,
  resolve: (key: string) => key,
  id: 'app',
});
const routes = getRoutes(context as never, { platform: 'android', ignoreEntryPoints: true });
const linking = getLinkingConfig(routes!, context as never, {
  metaOnly: true,
  skipGenerated: true,
  sitemap: false,
  notFound: false,
});

type Nested = { routes: { name: string; state?: Nested }[]; index?: number };
function stackOf(path: string, segments: string[]): string[] {
  const names: string[] = [];
  let state = linking.getStateFromPath!(path, linking.config, segments) as Nested | undefined;
  while (state !== undefined) {
    const route = state.routes[state.index ?? state.routes.length - 1]!;
    names.push(route.name);
    state = route.state;
  }
  return names.filter((name) => name !== '__root');
}

function pathOf(href: InboxHref): string {
  const { id, ...query } = href.params as Record<string, string>;
  return `${href.pathname.replace('[id]', encodeURIComponent(id!))}?${new URLSearchParams(query)}`;
}

const activityTab = ['(tabs)', '(activity)', 'activity'];

function openFromActivity(): string[] {
  const push = vi.fn<(href: InboxHref) => void>();
  const item = {
    id: 'native-session:event-1',
    kind: 'native-session-input',
    nativeSession: { sessionId: 'native-1', sessionTitle: 'Ship it' },
  } as unknown as HumanAttentionItem;
  openActivityItem(
    {} as never,
    { hostId: 'a', client: {} as HostClient, roster: undefined },
    item,
    push,
  );
  return stackOf(pathOf(push.mock.calls[0]![0]), activityTab);
}

describe('a Session opened from Activity', () => {
  it('stays in the Activity stack on Android, so Back returns to Activity', () => {
    expect(openFromActivity()).toEqual(['(tabs)', '(activity)', 'activity/session/[id]']);
  });

  it('keeps the iOS route unchanged', async () => {
    vi.doUnmock('../src/ui/shell/activity-session-route');
    vi.resetModules();
    const { openActivityItem: shared } = await import('../src/ui/shell/open-activity-item');
    const push = vi.fn<(href: InboxHref) => void>();
    shared(
      {} as never,
      { hostId: 'a', client: {} as HostClient, roster: undefined },
      {
        id: 'native-session:event-1',
        kind: 'native-session-input',
        nativeSession: { sessionId: 'native-1' },
      } as unknown as HumanAttentionItem,
      push,
    );
    expect(push.mock.calls[0]![0].pathname).toBe('/session/[id]');
  });

  it('leaves every other Session link on the stack it used before', () => {
    const session = '/session/native-1?hostId=a&source=native';
    expect(stackOf(session, [])).toEqual(['(tabs)', '(home)', 'session/[id]']);
    expect(stackOf(session, ['(tabs)', '(home)'])).toEqual(['(tabs)', '(home)', 'session/[id]']);
    expect(stackOf(session, ['(tabs)', '(sessions)', 'sessions'])).toEqual([
      '(tabs)',
      '(sessions)',
      'session/[id]',
    ]);
    for (const tab of ['(pinned)', '(settings)'])
      expect(stackOf(session, ['(tabs)', tab])).toEqual(['(tabs)', '(home)', 'session/[id]']);
    expect(stackOf(session, ['bot', '[slug]'])).toEqual(['(tabs)', '(home)', 'session/[id]']);
  });
});
