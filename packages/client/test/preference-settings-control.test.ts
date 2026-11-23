import { afterEach, expect, it, vi } from 'vitest';
import { createAppearanceControl } from '../../core/src/appearance/control.js';
import { Appearance, APPEARANCE_KEY } from '../src/client/appearance.js';
import { mountAppearanceControl } from '../src/client/appearance-control.js';
import { ClientSettings, clientSettings } from '../src/client/client-settings-control.js';
import {
  DESKTOP_NOTIFICATIONS_KEY,
  DesktopNotificationPrefs,
  type DesktopNotificationApi,
} from '../src/client/desktop-notifications.js';
import { preferenceSettingsDomain } from '../src/client/preference-settings-control.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values,
  };
}

function locale(active = 'en') {
  const state = {
    active,
    locales: [
      { id: 'en', label: 'English' },
      { id: 'zh', label: '中文' },
    ],
  };
  return {
    getSnapshot: () => state,
    setLocale: vi.fn((id: string) => {
      state.active = id;
    }),
  };
}

function api(permission: 'default' | 'granted' | 'denied'): DesktopNotificationApi {
  return {
    permission: () => permission,
    requestPermission: vi.fn(async () => permission),
    show: vi.fn(),
  };
}

function client(permission: 'default' | 'granted' | 'denied' = 'granted', data = storage()) {
  const appearance = new Appearance(data, () => 'light');
  const alerts = new DesktopNotificationPrefs(data, api(permission));
  const language = locale();
  const settings = new ClientSettings();
  settings.register('preferences', preferenceSettingsDomain(appearance, language, alerts));
  const live = { expiresAt: Date.now() + 5000, signal: new AbortController().signal };
  return { appearance, alerts, language, settings, data, live };
}

it('changes theme and notifications on the selected Client only and reads them back after reload', async () => {
  const a = client();
  const b = client();
  const before = (await a.settings.execute({ domain: 'preferences' }, undefined, a.live)) as {
    revision: string;
  };
  const after = await a.settings.execute(
    { domain: 'preferences', patch: { theme: 'dark', notifications: { enabled: true } } },
    before.revision,
    a.live,
  );
  expect(after).toMatchObject({
    theme: { preference: 'dark', mode: 'dark', scope: 'client' },
    notifications: { enabled: true, permission: 'granted', active: true, scope: 'client' },
  });
  expect(a.data.values.get(DESKTOP_NOTIFICATIONS_KEY)).toBe('on');
  expect(b.data.values.has(APPEARANCE_KEY)).toBe(false);
  expect(await b.settings.execute({ domain: 'preferences' }, undefined, b.live)).toMatchObject({
    theme: { preference: 'system' },
    notifications: { enabled: false },
  });
  const reloaded = client('granted', a.data);
  expect(
    await reloaded.settings.execute({ domain: 'preferences' }, undefined, reloaded.live),
  ).toEqual(after);
});

it('changes locale through the existing owner and reports that it is Host-scoped', async () => {
  const a = client();
  const { revision } = (await a.settings.execute({ domain: 'preferences' }, undefined, a.live)) as {
    revision: string;
  };
  const result = await a.settings.execute(
    { domain: 'preferences', patch: { locale: 'zh' } },
    revision,
    a.live,
  );
  expect(a.language.setLocale).toHaveBeenCalledWith('zh');
  expect(result).toMatchObject({ locale: { active: 'zh', scope: 'host' } });
  await expect(
    a.settings.execute(
      { domain: 'preferences', patch: { locale: 'xx' } },
      (result as { revision: string }).revision,
      a.live,
    ),
  ).rejects.toMatchObject({ code: 'locale-unknown' });
});

it.each([
  ['default', 'notification-permission-pending'],
  ['denied', 'notification-permission-denied'],
] as const)(
  'never prompts for consent and reports %s permission honestly',
  async (permission, code) => {
    const a = client(permission);
    const { revision } = (await a.settings.execute(
      { domain: 'preferences' },
      undefined,
      a.live,
    )) as {
      revision: string;
    };
    await expect(
      a.settings.execute(
        { domain: 'preferences', patch: { notifications: { enabled: true } } },
        revision,
        a.live,
      ),
    ).rejects.toMatchObject({ code });
    expect(a.alerts.api?.requestPermission).not.toHaveBeenCalled();
    expect(a.data.values.has(DESKTOP_NOTIFICATIONS_KEY)).toBe(false);
    expect(await a.settings.execute({ domain: 'preferences' }, undefined, a.live)).toMatchObject({
      revision,
      notifications: { enabled: false, permission, active: false },
    });
  },
);

it('refuses stale revisions, invalid patches, expired deadlines and an unregistered domain', async () => {
  const a = client();
  const write = (patch: unknown, revision = 'old', live = a.live) =>
    a.settings.execute({ domain: 'preferences', patch }, revision, live);
  await expect(write({ theme: 'dark' })).rejects.toMatchObject({
    code: 'client-settings-revision-conflict',
  });
  const { revision } = (await a.settings.execute({ domain: 'preferences' }, undefined, a.live)) as {
    revision: string;
  };
  for (const patch of [{}, { theme: 'blue' }, { motion: 'reduced' }, { notifications: true }])
    await expect(write(patch, revision)).rejects.toMatchObject({
      code: 'client-settings-invalid-input',
    });
  await expect(
    write({ theme: 'dark' }, revision, { ...a.live, expiresAt: Date.now() - 1 }),
  ).rejects.toMatchObject({ code: 'appearance-request-stale' });
  expect(a.appearance.getSnapshot().config.preference).toBe('system');
  await expect(a.settings.execute({ domain: 'layout' }, undefined, a.live)).rejects.toMatchObject({
    code: 'client-settings-unavailable',
  });
  await expect(a.settings.execute({ domain: 'theme' }, undefined, a.live)).rejects.toMatchObject({
    code: 'client-settings-invalid-input',
  });
});

it('runs a selected-Client preference write end to end through the Host relay', async () => {
  const host = createAppearanceControl();
  const data = storage();
  const appearance = new Appearance(data, () => 'light');
  const off = clientSettings.register(
    'preferences',
    preferenceSettingsDomain(
      appearance,
      locale(),
      new DesktopNotificationPrefs(data, api('granted')),
    ),
  );
  vi.stubGlobal('location', { protocol: 'http:' });
  vi.stubGlobal('fetch', (_url: string, init?: RequestInit) =>
    host.fetch(new Request('http://localhost/api/botharness/appearance-control', init)),
  );
  const release = mountAppearanceControl(appearance);
  const call = async (body: Record<string, unknown>) =>
    (
      await host.fetch(
        new Request('http://localhost/api/botharness/appearance-control', {
          method: 'POST',
          body: JSON.stringify({ action: 'request', expiresAt: Date.now() + 5000, ...body }),
        }),
      )
    ).json();
  try {
    await vi.waitFor(async () =>
      expect(
        (await (await host.fetch(new Request('http://localhost'))).json()).clients,
      ).toHaveLength(1),
    );
    const [{ id }] = (await (await host.fetch(new Request('http://localhost'))).json()).clients;
    await vi.waitFor(async () =>
      expect(await call({ clientId: id, settings: { domain: 'preferences' } })).toHaveProperty(
        'revision',
      ),
    );
    const { revision } = await call({ clientId: id, settings: { domain: 'preferences' } });
    expect(
      await call({
        clientId: id,
        settings: { domain: 'preferences', patch: { theme: 'dark' } },
        expectedRevision: revision,
      }),
    ).toMatchObject({ theme: { preference: 'dark' } });
    expect(
      await call({
        clientId: id,
        settings: { domain: 'preferences', patch: { theme: 'light' } },
        expectedRevision: revision,
      }),
    ).toEqual({
      error: {
        code: 'client-settings-revision-conflict',
        message: 'client-settings-revision-conflict',
      },
    });
    expect(appearance.getSnapshot().config.preference).toBe('dark');
  } finally {
    release();
    off();
    host.dispose();
  }
});
