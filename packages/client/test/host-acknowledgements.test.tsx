// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: () => null,
  IconCloseOutlineRegular: () => null,
}));

vi.mock('../src/client/ds/tooltip.js', () => ({
  Tooltip: ({ children }: { children: unknown }) => children,
}));

import type { BridgeCall } from '../src/client/bridge.js';
import {
  HostAcknowledgements,
  installHostAcknowledgements,
} from '../src/client/host-acknowledgements.js';
import { zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import {
  OnboardingEnterHint,
  markBotModeEntered,
} from '../src/client/onboarding-checklist-view.js';
import { MobileAppsEntry } from '../src/client/mobile-apps.js';
import { markSessionsTourSeen, sessionsTourSeen } from '../src/client/onboarding-sessions-tour.js';
import { RELEASE_NOTES_SEEN_KEY, ReleaseNotesController } from '../src/client/release-notes.js';
import {
  TELEMETRY_NOTICE_SEEN_KEY,
  TelemetryNoticeController,
} from '../src/client/telemetry-notice.js';

const t = zhTranslate as unknown as BotHarnessTranslate;

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function profile(items: Record<string, string> = {}, version = '1.6.1') {
  const stored = { ...items };
  const call = vi.fn<BridgeCall>(async (endpoint, payload) => {
    if (endpoint === 'acknowledgements') return { ok: true, value: { items: { ...stored } } };
    if (endpoint === 'acknowledge') {
      const key = String(payload['key']);
      stored[key] = typeof payload['value'] === 'string' ? payload['value'] : '1';
      return { ok: true, value: { key, value: stored[key] } };
    }
    if (endpoint === 'releaseInfo')
      return {
        ok: true,
        value: {
          version,
          identity: { kind: 'release', version },
          profileId: 'profile-a',
          releases:
            payload['since'] === version
              ? []
              : [
                  {
                    version,
                    date: '2026-11-01',
                    summary: { en: 'Summary', zh: '摘要' },
                    sections: [],
                  },
                ],
        },
      };
    if (endpoint === 'telemetryStatus') return { ok: true, value: { enabled: true } };
    throw new Error(`unexpected ${endpoint}`);
  });
  return { stored, call };
}

let uninstall: (() => void) | undefined;
afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  localStorage.clear();
});

async function render(element: ReturnType<typeof createElement>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe('one-time notices after browser storage is lost', () => {
  it('keeps the Bot mode hint hidden when the Profile already entered Bot mode', async () => {
    const host = profile({ 'bot-mode-entered': '1' });
    const acks = new HostAcknowledgements(host.call, localStorage);
    uninstall = installHostAcknowledgements(acks);
    const view = await render(createElement(OnboardingEnterHint, { t }));
    expect(view.host.textContent).toBe('');
    await act(async () => {
      await acks.load();
    });
    expect(view.host.textContent).toBe('');
    expect(localStorage.getItem('botharness/onboarding/bot-mode-entered')).toBe('1');
    view.unmount();
  });

  it('shows the hint only for a Profile that never entered Bot mode, then remembers entry on the Profile', async () => {
    const host = profile();
    const acks = new HostAcknowledgements(host.call, localStorage);
    uninstall = installHostAcknowledgements(acks);
    const view = await render(createElement(OnboardingEnterHint, { t }));
    expect(view.host.textContent).toBe('');
    await act(async () => {
      await acks.load();
    });
    expect(view.host.textContent).toContain(t('onboarding.enter.title'));
    await act(async () => {
      markBotModeEntered();
    });
    expect(view.host.textContent).toBe('');
    expect(host.stored['bot-mode-entered']).toBe('1');
    view.unmount();
  });

  it('uploads an older local acknowledgement once so a later origin keeps it', async () => {
    localStorage.setItem('botharness/onboarding/bot-mode-entered', '1');
    const host = profile();
    const acks = new HostAcknowledgements(host.call, localStorage);
    uninstall = installHostAcknowledgements(acks);
    await acks.load();
    const view = await render(createElement(OnboardingEnterHint, { t }));
    expect(view.host.textContent).toBe('');
    expect(host.stored['bot-mode-entered']).toBe('1');
    view.unmount();
  });

  it('does not announce release notes the Profile already dismissed', async () => {
    const host = profile({ 'release-notes-seen': '1.6.1' });
    const storage = memoryStorage();
    const controller = new ReleaseNotesController(
      host.call,
      storage,
      undefined,
      undefined,
      new HostAcknowledgements(host.call, storage),
    );
    await controller.start();
    expect(controller.source.getSnapshot().announcement).toBeUndefined();
    expect(host.call).toHaveBeenCalledWith('releaseInfo', { since: '1.6.1' });
  });

  it('remembers dismissed release notes on the Profile and keeps the newest seen version', async () => {
    const host = profile({ 'release-notes-seen': '1.5.0' });
    const storage = memoryStorage();
    const acks = new HostAcknowledgements(host.call, storage);
    const controller = new ReleaseNotesController(host.call, storage, undefined, undefined, acks);
    await controller.start();
    expect(controller.source.getSnapshot().announcement).toHaveLength(1);
    controller.dismiss();
    expect(storage.values.get(RELEASE_NOTES_SEEN_KEY)).toBe('1.6.1');
    expect(host.stored['release-notes-seen']).toBe('1.6.1');

    const older = profile({ 'release-notes-seen': '1.6.1' });
    const local = memoryStorage({ [RELEASE_NOTES_SEEN_KEY]: '1.5.0' });
    await new ReleaseNotesController(
      older.call,
      local,
      undefined,
      undefined,
      new HostAcknowledgements(older.call, local),
    ).start();
    expect(older.call).toHaveBeenCalledWith('releaseInfo', { since: '1.6.1' });
    expect(older.stored['release-notes-seen']).toBe('1.6.1');
  });

  it('does not reopen the telemetry notice the Profile already saw', async () => {
    const host = profile({ 'telemetry-notice': '1' });
    const storage = memoryStorage();
    const notice = new TelemetryNoticeController(
      host.call,
      storage,
      undefined,
      new HostAcknowledgements(host.call, storage),
    );
    await notice.start();
    expect(notice.source.getSnapshot().open).toBe(false);
    expect(storage.values.get(TELEMETRY_NOTICE_SEEN_KEY)).toBe('1');

    const fresh = profile();
    const freshStorage = memoryStorage();
    const first = new TelemetryNoticeController(
      fresh.call,
      freshStorage,
      undefined,
      new HostAcknowledgements(fresh.call, freshStorage),
    );
    await first.start();
    expect(first.source.getSnapshot().open).toBe(true);
    first.dismiss();
    expect(fresh.stored['telemetry-notice']).toBe('1');
  });

  it('keeps the mobile app hint hidden when the Profile already dismissed it', async () => {
    const host = profile({ 'mobile-apps': '1' });
    const acks = new HostAcknowledgements(host.call, localStorage);
    uninstall = installHostAcknowledgements(acks);
    const view = await render(createElement(MobileAppsEntry, { t }));
    expect(document.querySelector('.bh-mobile-apps-hint')).toBeNull();
    await act(async () => {
      await acks.load();
    });
    expect(document.querySelector('.bh-mobile-apps-hint')).toBeNull();
    expect(localStorage.getItem('botharness/mobile-apps/seen')).toBe('1');
    view.unmount();
  });

  it('shows the mobile app hint once per Profile and records the dismissal on the Host', async () => {
    const host = profile();
    const acks = new HostAcknowledgements(host.call, localStorage);
    uninstall = installHostAcknowledgements(acks);
    const view = await render(createElement(MobileAppsEntry, { t }));
    await act(async () => {
      await acks.load();
    });
    const hint = document.querySelector('.bh-mobile-apps-hint');
    expect(hint).not.toBeNull();
    await act(async () => {
      hint!.querySelector<HTMLButtonElement>('button[aria-label]')!.click();
    });
    expect(document.querySelector('.bh-mobile-apps-hint')).toBeNull();
    expect(host.stored['mobile-apps']).toBe('1');
    view.unmount();
  });

  it('keeps the sessions tour checked on the Profile after browser storage is lost', async () => {
    const host = profile({ 'onboarding-sessions': '1' });
    const acks = new HostAcknowledgements(host.call, localStorage);
    uninstall = installHostAcknowledgements(acks);
    await acks.load();
    expect(sessionsTourSeen()).toBe(true);

    uninstall();
    const fresh = profile();
    const freshAcks = new HostAcknowledgements(fresh.call, memoryStorage());
    uninstall = installHostAcknowledgements(freshAcks);
    await freshAcks.load();
    expect(sessionsTourSeen()).toBe(false);
    markSessionsTourSeen();
    expect(sessionsTourSeen()).toBe(true);
    expect(fresh.stored['onboarding-sessions']).toBe('1');
  });

  it('falls back to browser storage when the Host cannot answer', async () => {
    const call = vi.fn<BridgeCall>(async () => ({
      ok: false,
      error: { code: 'unavailable', message: 'old Host', details: {} },
    }));
    const acks = new HostAcknowledgements(call, localStorage);
    uninstall = installHostAcknowledgements(acks);
    await acks.load();
    const view = await render(createElement(OnboardingEnterHint, { t }));
    expect(view.host.textContent).toContain(t('onboarding.enter.title'));
    view.unmount();
  });
});
