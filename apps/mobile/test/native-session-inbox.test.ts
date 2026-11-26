import { afterEach, describe, expect, it } from 'vitest';

import { createHostClient, type HostClient } from '@botharness/host-client/client';
import { createInbox, type Inbox } from '@botharness/host-client/inbox';
import { parsePushData, pushHref } from '@botharness/host-client/push';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';
import { alertFromPush } from '../src/host/alert-banners';
import { readActivityCount } from '../src/host/activity-count';
import wire from './fixtures/inbox-wire.json';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const approval = wire.rpc['humanAttention.action'].result.value.items[0]!;
const native = {
  id: 'native-session:event-1',
  category: 'action',
  kind: 'native-session-input',
  createdAt: '2026-11-25T10:00:00.000Z',
  botSlug: '',
  summary: 'bash',
  requestId: 'event-1',
  nativeSession: { sessionId: 'native-1', input: 'question' },
};

let client: HostClient | undefined;
let inbox: Inbox | undefined;
afterEach(() => {
  inbox?.stop();
  client?.stop();
});

function connect(fake: FakeHost): HostClient {
  client = createHostClient({
    routes: [ROUTE],
    credential: fake.credential,
    carrier: fake.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  return client;
}

async function ready(target: Inbox) {
  for (let tries = 0; tries < 200; tries += 1) {
    const snapshot = target.getSnapshot();
    if (snapshot.status === 'ready') return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('timed out');
}

function host(echo: boolean): FakeHost {
  const fake = new FakeHost();
  fake.methods.set('humanAttention', (args) => ({
    queryVersion: 1,
    ...(echo && args['source'] !== undefined ? { source: args['source'] } : {}),
    items:
      args['category'] !== 'action'
        ? []
        : echo && args['source'] === 'native'
          ? [native]
          : echo && args['source'] === 'all'
            ? [approval, native]
            : [approval],
  }));
  return fake;
}

describe('native Session requests in the phone Inbox', () => {
  it('asks the Host for every source and keeps native rows beside Bot rows', async () => {
    const fake = host(true);
    inbox = createInbox(connect(fake), { activity: true, source: 'all' });
    const snapshot = await ready(inbox);
    expect(snapshot.sections.action.map((item) => item.id)).toEqual([approval.id, native.id]);
    expect(
      fake.calls
        .filter((call) => call.method === 'humanAttention')
        .every((call) => call.args['source'] === 'all'),
    ).toBe(true);
  });

  it('reads Bot items as before from a Host that does not echo the source', async () => {
    const fake = host(false);
    inbox = createInbox(connect(fake), { activity: true, source: 'all' });
    const snapshot = await ready(inbox);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.stale).toBeUndefined();
    expect(snapshot.sections.action.map((item) => item.id)).toEqual([approval.id]);
  });

  it('shows nothing for the Sessions filter on a Host without native requests', async () => {
    const old = host(false);
    inbox = createInbox(connect(old), { activity: true, source: 'native' });
    expect((await ready(inbox)).sections.action).toEqual([]);
    inbox.stop();
    client?.stop();
    const current = host(true);
    inbox = createInbox(connect(current), { activity: true, source: 'native' });
    expect((await ready(inbox)).sections.action.map((item) => item.id)).toEqual([native.id]);
  });

  it('counts a native question with questions on the Activity badge', async () => {
    const fake = host(true);
    const calls: Record<string, unknown>[] = [];
    const counting = {
      call: async (method: string, args: Record<string, unknown> = {}) => {
        calls.push(args);
        return fake.methods.get(method)!(args);
      },
    } as unknown as HostClient;
    expect(await readActivityCount(counting, ['questions'])).toBe(1);
    expect(await readActivityCount(counting, ['approvals', 'questions'])).toBe(2);
    expect(calls.every((args) => args['source'] === 'all')).toBe(true);
  });
});

describe('native Session notifications', () => {
  const data = {
    v: 1,
    hostId: 'studio',
    itemId: native.id,
    kind: 'native-session-input',
    sessionId: 'native-1',
    sender: 'Ship it',
  };

  it('open the Session detail instead of Activity', () => {
    const target = parsePushData(data);
    expect(target).toMatchObject({ hostId: 'studio', sessionId: 'native-1' });
    expect(pushHref(target!, () => undefined)).toEqual({
      pathname: '/session/[id]',
      params: { id: 'native-1', source: 'native' },
    });
  });

  it('keep the Session when shown as an in-app banner', () => {
    const alert = alertFromPush('Ship it', 'Has a question', data);
    expect(alert?.data.sessionId).toBe('native-1');
    expect(pushHref(parsePushData(alert!.data)!, () => undefined)).toMatchObject({
      pathname: '/session/[id]',
    });
  });

  it('leave Bot notifications on their existing route', () => {
    const target = parsePushData({ ...data, kind: 'tool-approval', botSlug: 'ada' });
    expect(pushHref(target!, () => undefined)).toMatchObject({ pathname: '/inbox/[id]' });
    expect(pushHref(parsePushData({ ...data, sessionId: undefined })!, () => undefined)).toEqual({
      pathname: '/activity',
    });
  });
});
