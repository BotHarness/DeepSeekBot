import { afterEach, expect, it, vi } from 'vitest';
import { parseSkillCatalogChange } from '../src/client/bridge.js';
import {
  installTypedLive,
  openSharedChannel,
  subscribeMessagingDefaults,
  subscribeSkillCatalog,
  type TypedLive,
} from '../src/client/messaging-defaults-live.js';

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0).reverse()) stop();
  vi.unstubAllGlobals();
});

it('parses skill event payloads at the bridge boundary', () => {
  const change = { botSlugs: ['ada'], channelIds: ['dm-ada', 'group'] };
  expect(parseSkillCatalogChange(JSON.stringify(change))).toEqual(change);
  expect(parseSkillCatalogChange(change)).toEqual(change);
  for (const invalid of [
    '{',
    null,
    {},
    { botSlugs: ['ada'], channelIds: [1] },
    { botSlugs: [''], channelIds: [] },
  ])
    expect(parseSkillCatalogChange(invalid)).toBeUndefined();
});

it('shares the SSE carrier, filters unrelated channels, refreshes on reconnect and cleans up', () => {
  const sources: Source[] = [];
  class Source extends EventTarget {
    readyState = 1;
    closed = false;
    constructor(readonly url: string) {
      super();
      sources.push(this);
    }
    close() {
      this.closed = true;
      this.readyState = 2;
    }
  }
  vi.stubGlobal('EventSource', Source);
  const roster = vi.fn();
  const ada = vi.fn();
  const bob = vi.fn();
  const stopRoster = subscribeMessagingDefaults(roster);
  const stopAda = subscribeSkillCatalog('dm-ada', ada);
  const stopBob = subscribeSkillCatalog('dm-bob', bob);
  stops.push(stopRoster, stopAda, stopBob);
  expect(sources).toHaveLength(1);
  const channel = openSharedChannel('/api/botharness/stream?channelId=dm-ada&after=0');
  stops.push(() => channel.close());
  expect(sources.filter((source) => !source.closed)).toHaveLength(1);
  const source = sources.at(-1)!;
  source.dispatchEvent(
    new MessageEvent('skills/catalog-changed', {
      data: JSON.stringify({ botSlugs: ['ada'], channelIds: ['dm-ada', 'group'] }),
    }),
  );
  source.dispatchEvent(new MessageEvent('skills/catalog-changed', { data: '{' }));
  expect(ada).toHaveBeenCalledTimes(1);
  expect(bob).not.toHaveBeenCalled();
  expect(roster).not.toHaveBeenCalled();
  source.dispatchEvent(new Event('open'));
  expect(ada).toHaveBeenCalledTimes(2);
  expect(bob).toHaveBeenCalledTimes(1);
  stopAda();
  source.dispatchEvent(
    new MessageEvent('skills/catalog-changed', {
      data: JSON.stringify({ botSlugs: ['ada'], channelIds: ['dm-ada'] }),
    }),
  );
  expect(ada).toHaveBeenCalledTimes(2);
});

it('uses typed roster notifications with no additional stream and refreshes subscriptions on a replacement baseline', () => {
  let handlers: Parameters<TypedLive['roster']>[0] | undefined;
  const close = vi.fn();
  const roster = vi.fn((next: Parameters<TypedLive['roster']>[0]) => {
    handlers = next;
    return close;
  });
  const activity = vi.fn(() => () => {});
  stops.push(installTypedLive({ roster, activity }));
  const ada = vi.fn();
  const bob = vi.fn();
  const stopAda = subscribeSkillCatalog('dm-ada', ada);
  const stopBob = subscribeSkillCatalog('dm-bob', bob);
  stops.push(stopAda, stopBob);
  expect(roster).toHaveBeenCalledTimes(1);
  expect(activity).not.toHaveBeenCalled();
  handlers!.baseline([]);
  handlers!.skills?.({ botSlugs: ['ada'], channelIds: ['dm-ada'] });
  handlers!.skills?.({ botSlugs: ['ada'], channelIds: [false] });
  expect(ada).toHaveBeenCalledTimes(2);
  expect(bob).toHaveBeenCalledTimes(1);
  stopAda();
  stopBob();
  expect(close).toHaveBeenCalledTimes(1);
});
