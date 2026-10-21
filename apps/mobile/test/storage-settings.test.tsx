// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
const alert = vi.fn();
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Alert: { alert: (...args: unknown[]) => alert(...args) },
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import { MethodRefused } from '../src/host/client';
import type { StorageCleanupPreview, StorageUsage } from '../src/host/storage';
import { StorageSettings, type StorageSettingsPort } from '../src/ui/storage-settings';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  alert.mockReset();
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  return host;
}

const usage: StorageUsage = {
  totalBytes: 8 * 1024 * 1024,
  parts: [
    { kind: 'media', bytes: 6 * 1024 * 1024 },
    { kind: 'messages', bytes: 1024 * 1024 },
    { kind: 'memory', bytes: 512 * 1024 },
    { kind: 'other', bytes: 512 * 1024 },
  ],
  chats: [
    { channelId: 'dm-ada', name: 'Ada', type: 'dm', messages: 40, mediaBytes: 5 * 1024 * 1024 },
    { channelId: 'grp-team', name: 'Team', type: 'group', messages: 9, mediaBytes: 1024 * 1024 },
    { channelId: 'dm-text', name: 'Text only', type: 'dm', messages: 3, mediaBytes: 0 },
  ],
};

function preview(scope: StorageCleanupPreview['scope']): StorageCleanupPreview {
  return {
    token: 'reviewed',
    scope,
    messages: 2,
    files: 3,
    bytes: 5 * 1024 * 1024,
    freedBytes: 4 * 1024 * 1024,
    kept: [{ reason: 'bot-working', files: 1 }],
  };
}

function port(overrides: Partial<StorageSettingsPort> = {}) {
  return {
    usage: vi.fn(async () => usage),
    preview: vi.fn(async (scope: Parameters<StorageSettingsPort['preview']>[0]) =>
      preview({ channelIds: [], ...scope }),
    ),
    confirm: vi.fn(async () => ({ messages: 2, files: 3, freedBytes: 4 * 1024 * 1024 })),
    clearImageCache: vi.fn(async () => undefined),
    ...overrides,
  };
}

const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;

async function press(view: HTMLElement, label: string) {
  await act(async () => button(view, label).click());
  await act(async () => undefined);
}

async function choose(text: string) {
  const actions = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
  await act(async () => actions.find((entry) => entry.text === text)!.onPress?.());
  await act(async () => undefined);
}

const notices = (view: HTMLElement, tone: string) =>
  [...view.querySelectorAll(`[data-testid="notice-${tone}"]`)].map((node) => node.textContent);

describe('Storage settings', () => {
  it('shows space used and clears the chosen chat media after confirmation', async () => {
    const storage = port();
    const view = await render(<StorageSettings port={storage} />);
    expect(view.textContent).toContain(t.storage.total('8.0 MB'));
    expect(view.textContent).toContain(t.storage.part.media);
    expect(view.textContent).toContain('6.0 MB');
    expect(view.textContent).toContain('Ada');
    expect(view.textContent).not.toContain('Text only');

    await press(view, 'Team');
    await press(view, t.storage.kind.file);
    await press(view, `${t.storage.age.all}`);
    await press(view, t.storage.clear);
    const scope = vi.mocked(storage.preview).mock.calls[0]![0];
    expect(scope).toMatchObject({ channelIds: ['dm-ada'], kinds: ['image', 'video', 'audio'] });
    expect(Math.abs(Date.parse(scope.before) - Date.now())).toBeLessThan(60_000);

    expect(alert.mock.calls.at(-1)![0]).toBe(t.storage.confirmTitle);
    const message = alert.mock.calls.at(-1)![1] as string;
    expect(message).toContain(t.storage.confirmLead(3, 2, '4.0 MB'));
    expect(message).toContain(t.storage.kept['bot-working'](1));
    expect(message).toContain(t.storage.shared);

    await choose(t.cancel);
    expect(storage.confirm).not.toHaveBeenCalled();

    await press(view, t.storage.clear);
    await choose(t.storage.confirm);
    expect(storage.confirm).toHaveBeenCalledWith(expect.objectContaining({ token: 'reviewed' }));
    expect(notices(view, 'success')).toEqual([t.storage.done(3, '4.0 MB')]);
    expect(storage.usage).toHaveBeenCalledTimes(2);
  });

  it('says when the Host refuses a preview that changed, and clears the image cache', async () => {
    const storage = port({
      confirm: vi.fn(async () => {
        throw new MethodRefused('storage-preview-stale', 'changed');
      }),
    });
    const view = await render(<StorageSettings port={storage} />);
    await press(view, t.storage.clear);
    expect(vi.mocked(storage.preview).mock.calls[0]![0]).not.toHaveProperty('channelIds');
    await choose(t.storage.confirm);
    expect(notices(view, 'danger')).toEqual([t.storage.stale]);

    await press(view, t.storage.imageCache);
    expect(storage.clearImageCache).toHaveBeenCalledTimes(1);
    expect(notices(view, 'success')).toEqual([t.storage.imageCacheDone]);
  });

  it('explains when nothing matches instead of asking to confirm', async () => {
    const storage = port({
      preview: vi.fn(async (scope) => ({
        ...preview({ channelIds: [], ...scope }),
        files: 0,
        messages: 0,
        bytes: 0,
        freedBytes: 0,
        kept: [],
      })),
    });
    const view = await render(<StorageSettings port={storage} />);
    await press(view, t.storage.clear);
    expect(alert.mock.calls.at(-1)![1]).toBe(t.storage.nothing);
    expect((alert.mock.calls.at(-1)![2] as { text: string }[]).map((a) => a.text)).toEqual([
      t.done,
    ]);
  });
});
