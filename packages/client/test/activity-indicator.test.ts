// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  ACTIVITY_INDICATOR_KEY,
  activityIndicator,
  createActivityIndicatorPreference,
} from '../src/client/activity-indicator.js';
import { loadHumanAttentionStatus, type BridgeCall } from '../src/client/bridge.js';
import { createActions } from '../src/client/actions.js';
import { createStore } from '../src/client/store.js';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it('separates each indicator scope from full unread and action state', () => {
  const state = {
    unreadCount: 7,
    hasAction: false,
    messageCounts: { replies: 0, other: 7 },
    attentionStatus: 'ready' as const,
  };
  expect(activityIndicator('all', state)).toBe('on');
  expect(activityIndicator('action', state)).toBe('off');
  expect(activityIndicator('replies', state)).toBe('off');
  expect(activityIndicator('unread', state)).toBe('on');
  expect(activityIndicator('none', state)).toBe('off');
  const requests = {
    ...state,
    unreadCount: 0,
    hasAction: true,
    messageCounts: { replies: 0, other: 0 },
  };
  expect(activityIndicator('action', requests)).toBe('on');
  expect(activityIndicator('unread', requests)).toBe('off');
  expect(activityIndicator('replies', { ...state, messageCounts: { replies: 7, other: 0 } })).toBe(
    'on',
  );
  expect(state.unreadCount).toBe(7);
});

it('does not interpret missing or failed status as zero, but always honors Off', () => {
  const state = { unreadCount: 2, hasAction: true };
  expect(activityIndicator('all', state)).toBe('unknown');
  expect(activityIndicator('none', state)).toBe('off');
  expect(activityIndicator('replies', { ...state, attentionStatus: 'ready' })).toBe('unknown');
  expect(activityIndicator('all', { ...state, attentionStatus: 'error' })).toBe('unknown');
});

it('persists the independent preference, defaults invalid values, and synchronizes storage changes', () => {
  localStorage.setItem(ACTIVITY_INDICATOR_KEY, 'invalid');
  const preference = createActivityIndicatorPreference(window);
  expect(preference.getSnapshot().scope).toBe('all');
  const release = preference.subscribe(vi.fn());
  preference.set('none');
  expect(createActivityIndicatorPreference(window).getSnapshot().scope).toBe('none');
  localStorage.setItem(ACTIVITY_INDICATOR_KEY, 'replies');
  window.dispatchEvent(
    new StorageEvent('storage', { key: ACTIVITY_INDICATOR_KEY, storageArea: sessionStorage }),
  );
  expect(preference.getSnapshot().scope).toBe('none');
  window.dispatchEvent(
    new StorageEvent('storage', { key: ACTIVITY_INDICATOR_KEY, storageArea: localStorage }),
  );
  expect(preference.getSnapshot().scope).toBe('replies');
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
  expect(preference.getSnapshot().scope).toBe('all');
  release();
  localStorage.setItem(ACTIVITY_INDICATOR_KEY, 'action');
  window.dispatchEvent(
    new StorageEvent('storage', { key: ACTIVITY_INDICATOR_KEY, storageArea: localStorage }),
  );
  expect(preference.getSnapshot().scope).toBe('all');
  const detach = preference.subscribe(vi.fn());
  expect(preference.getSnapshot().scope).toBe('action');
  detach();
});

it('keeps the chosen scope when persistence fails and reports the failure', () => {
  const preference = createActivityIndicatorPreference(window);
  const release = preference.subscribe(vi.fn());
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  preference.set('none');
  expect(preference.getSnapshot()).toEqual({ scope: 'none', saveFailed: true });
  release();
});

it('accepts complete Host counts, preserves legacy status and refuses malformed summaries', async () => {
  const call = vi.fn<BridgeCall>(async () => ({
    ok: true,
    value: { unreadCount: 3, hasAction: true, messageCounts: { replies: 1, other: 2 } },
  }));
  expect(await loadHumanAttentionStatus(call)).toMatchObject({
    messageCounts: { replies: 1, other: 2 },
  });
  expect(call).toHaveBeenCalledWith('humanAttentionStatus', { messageCounts: true }, undefined);
  expect(
    await loadHumanAttentionStatus(async () => ({
      ok: true,
      value: { unreadCount: 3, hasAction: false },
    })),
  ).toMatchObject({ unreadCount: 3, messageCounts: undefined });
  await expect(
    loadHumanAttentionStatus(async () => ({
      ok: true,
      value: { unreadCount: 3, hasAction: true, messageCounts: { replies: 3, other: 2 } },
    })),
  ).rejects.toThrow('invalid Human attention message counts');
});

it('retains last canonical facts on a failed refresh and restores ready state on retry', async () => {
  const store = createStore();
  let fail = false;
  const actions = createActions(async (method) => {
    if (method === 'channelUnreadCounts') return { ok: true, value: { channels: [] } };
    if (fail) throw new Error('offline');
    return {
      ok: true,
      value: { unreadCount: 3, hasAction: true, messageCounts: { replies: 1, other: 2 } },
    };
  }, store);
  await actions.refreshHumanInboxStatus();
  expect(store.getSnapshot().humanInbox.attentionStatus).toBe('ready');
  fail = true;
  await actions.refreshHumanInboxStatus();
  expect(store.getSnapshot().humanInbox).toMatchObject({
    attentionStatus: 'error',
    unreadCount: 3,
    messageCounts: { replies: 1, other: 2 },
  });
  fail = false;
  await actions.refreshHumanInboxStatus();
  expect(store.getSnapshot().humanInbox.attentionStatus).toBe('ready');
});
