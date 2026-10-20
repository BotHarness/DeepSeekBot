import { afterEach, describe, expect, it } from 'vitest';

import { createHostClient, type HostClient, type HostSnapshot } from '../src/host/client';
import { FakeHost } from './fake-host';
import wire from './fixtures/host-wire.json';

const [baseline] = wire.mux.activity;
const slug = baseline!.snapshot.bots[0]!.slug;
const generation = baseline!.snapshot.generation;
let revision = 10;

const frame = (bot: Record<string, unknown>) => ({
  type: 'changed',
  snapshot: { generation, revision: (revision += 1), bots: [{ slug, ...bot }] },
});
const tool = {
  effect: 'executing',
  toolName: 'pwsh',
  publicDetail: 'Get-ChildItem',
  activeToolCount: 1,
};

let client: HostClient | undefined;
afterEach(() => client?.stop());

async function until(
  target: HostClient,
  accept: (snapshot: HostSnapshot) => boolean,
): Promise<HostSnapshot> {
  for (let tries = 0; tries < 600; tries += 1) {
    const snapshot = target.getSnapshot();
    if (accept(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('timed out');
}

describe('smoothed Bot activity on mobile', () => {
  it('keeps thinking through a short tool call and still settles', async () => {
    const host = new FakeHost();
    const target = createHostClient({
      routes: ['https://studio.tailnet-example.ts.net'],
      credential: host.credential,
      carrier: host.carrier,
      backoff: () => 5,
      timeoutMs: 200,
    });
    client = target;
    target.start();
    await until(target, (s) => s.connection.status === 'connected');
    const seen: string[] = [];
    target.subscribe(() => {
      const state = target.getSnapshot().roster?.bots[0]?.state;
      if (state !== undefined && seen.at(-1) !== state) seen.push(state);
    });

    host.push('botharness/followActivity', frame({ state: 'thinking' }));
    await until(target, (s) => s.roster?.bots[0]?.state === 'thinking');
    host.push('botharness/followActivity', frame({ state: 'working', activity: tool }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    host.push('botharness/followActivity', frame({ state: 'thinking' }));
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(seen).toEqual(['thinking']);
    expect(target.getSnapshot().roster?.bots[0]?.activity).toBeUndefined();

    host.push('botharness/followActivity', frame({ state: 'working', activity: tool }));
    const working = await until(target, (s) => s.roster?.bots[0]?.state === 'working');
    expect(working.roster?.bots[0]?.activity).toMatchObject({ toolName: 'pwsh' });

    host.push('botharness/followActivity', frame({ state: 'idle' }));
    await until(target, (s) => s.roster?.bots[0]?.state === 'idle');
    expect(seen).toEqual(['thinking', 'working', 'idle']);
  });
});
