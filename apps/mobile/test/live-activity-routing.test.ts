import { expect, it } from 'vitest';
import {
  activityDestination,
  activityStartTarget,
  subscribeActivityHost,
} from '../src/host/live-activity-routing';

it('requires the original Computer and DM even when another Computer has the same Bot slug', () => {
  const target = {
    hostId: 'source-a',
    channelId: 'dm-ada',
    botSlug: 'ada',
    messageId: 'request-1',
  };
  expect(activityDestination(target, 'source-b', 'dm-ada')).toBeUndefined();
  expect(activityDestination(target, 'source-a', 'other-dm')).toBeUndefined();
  expect(activityDestination(target, 'source-a', 'dm-ada')).toEqual({
    pathname: '/dm/[slug]',
    params: { slug: 'ada', hostId: 'source-a', focus: 'request-1' },
  });
});

it('waits for the exact locally initiated request and rejects delayed acceptance in another source or channel', () => {
  const initiated = {
    hostId: 'source-a',
    channelId: 'dm-ada',
    botSlug: 'ada',
    messageId: 'request-1',
  };
  expect(activityStartTarget(undefined, 'source-a', 'dm-ada', ['request-1'])).toBeUndefined();
  expect(
    activityStartTarget(initiated, 'source-a', 'dm-ada', ['other-human-message']),
  ).toBeUndefined();
  expect(activityStartTarget(initiated, 'source-b', 'dm-ada', ['request-1'])).toBeUndefined();
  expect(activityStartTarget(initiated, 'source-a', 'dm-other', ['request-1'])).toBeUndefined();
  expect(activityStartTarget(initiated, 'source-a', 'dm-ada', ['request-1'])).toEqual(initiated);
});

it('binds a first DM to the exact locally initiated receipt when its Channel is created', () => {
  const initiated = { hostId: 'source-a', botSlug: 'ada', messageId: 'first-request' };
  expect(activityStartTarget(initiated, 'source-a', undefined, ['first-request'])).toBeUndefined();
  expect(
    activityStartTarget(initiated, 'source-a', 'created-dm', ['historical-request']),
  ).toBeUndefined();
  expect(
    activityStartTarget(initiated, 'source-b', 'created-dm', ['first-request']),
  ).toBeUndefined();
  expect(activityStartTarget(initiated, 'source-a', 'created-dm', ['first-request'])).toEqual({
    ...initiated,
    channelId: 'created-dm',
  });
});

it('rebinds current-client events and ignores late events from an old source or disposed watcher', () => {
  const client = () => {
    const listeners = new Set<() => void>();
    return {
      listeners,
      subscribe: (fn: () => void) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
    };
  };
  const a = client();
  const b = client();
  const sessionListeners = new Set<() => void>();
  const state = { saved: { hostId: 'a' }, client: a };
  let events = 0;
  const stop = subscribeActivityHost(
    {
      getState: () => state,
      subscribe: (fn) => {
        sessionListeners.add(fn);
        return () => {
          sessionListeners.delete(fn);
        };
      },
    },
    () => {
      events += 1;
    },
  );
  const lateA = [...a.listeners][0]!;
  lateA();
  expect(events).toBe(1);
  state.saved = { hostId: 'b' };
  state.client = b;
  for (const fn of sessionListeners) fn();
  expect(a.listeners.size).toBe(0);
  expect(b.listeners.size).toBe(1);
  lateA();
  expect(events).toBe(2);
  const lateB = [...b.listeners][0]!;
  stop();
  lateB();
  expect(events).toBe(2);
  expect(sessionListeners.size + b.listeners.size).toBe(0);
});
