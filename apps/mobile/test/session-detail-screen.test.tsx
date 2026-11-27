// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MethodRefused } from '@botharness/host-client/client';
import { edgeFade, space } from '../src/ui/design/tokens';
import { interfacePreferences } from '../src/ui/interface-preferences';
import {
  platform,
  navigation,
  place,
  open,
  press,
  unmount,
  buttons,
  approval,
  chatTimelineListLayout,
} from './session-detail-fixture';

interfacePreferences.setSystemLocales(['en']);
afterEach(unmount);

it('continues a native Session in the shared detail without offering Bot management actions', async () => {
  const { view, call } = await open({ role: 'native', running: true, live: true });
  expect(view.textContent).toContain('Live reply');
  expect(call).toHaveBeenCalledWith(
    'sessionTranscript',
    { slug: null, sessionId: 'chosen' },
    expect.anything(),
  );
  await press(view, 'Draft');
  await press(view, 'Send');
  expect(call).toHaveBeenCalledWith('sessionMessageSend', {
    botSlug: null,
    sessionId: 'chosen',
    text: 'Follow up',
  });
  expect(call.mock.calls.some(([method]) => method === 'assignmentTimeline')).toBe(false);
  expect(call.mock.calls.some(([method]) => method === 'sessionStop')).toBe(false);
});

it('renders user input, saved and live replies, compact activity and the model switch', async () => {
  const { view } = await open({ live: true });
  expect(view.querySelector('[data-testid="session-header-title"]')?.textContent).toBe(
    'Review the release',
  );
  expect(view.textContent).toContain('Direct message');
  expect(view.textContent).toContain('Inbox');
  expect(view.textContent).not.toContain('Source Event');
  const inbox = view.querySelector<HTMLButtonElement>(
    '[data-testid="session-transcript-inbox-disclosure"]',
  );
  expect(inbox?.getAttribute('aria-label')).toBe('Inbox');
  await act(async () => inbox!.click());
  expect(view.textContent).toContain('Source Event');
  const failure = [...view.querySelectorAll('span')].find((row) =>
    row.textContent?.includes('Then retry the message.'),
  );
  expect(failure).toBeDefined();
  expect(failure?.hasAttribute('data-number-of-lines')).toBe(false);
  expect(view.querySelectorAll('[data-author="human"]')).toHaveLength(1);
  expect(view.querySelector('[data-author="human"]')?.textContent).toBe('Initial request');
  expect([...view.querySelectorAll('[data-author="bot"]')].map((row) => row.textContent)).toEqual([
    'Saved reply',
    'Live reply',
  ]);
  expect(view.querySelectorAll('[data-testid="session-transcript-tool"]')).toHaveLength(1);
  expect(view.querySelector('[data-testid="turn-model-switch"]')?.textContent).toContain(
    'deepseek-v4.1-pro',
  );
  expect(view.querySelector('[data-testid="composer-session-model"]')).not.toBeNull();
});

it('shows the native Session switch once with just the model names', async () => {
  const { view } = await open({ role: 'native' });
  const markers = view.querySelectorAll('[data-testid="turn-model-switch"]');
  expect(markers).toHaveLength(1);
  const label = 'Switched from deepseek-v4.1-flash to deepseek-v4.1-pro';
  expect(markers[0]?.textContent).toBe(label);
  expect(markers[0]?.getAttribute('aria-label')).toBe(label);
});

it('sends a draft to the selected Orchestrator', async () => {
  const { view, call } = await open();
  await press(view, 'Draft');
  await press(view, 'Send');
  expect(call).toHaveBeenCalledWith('sessionMessageSend', {
    botSlug: 'ada',
    sessionId: 'chosen',
    text: 'Follow up',
  });
  expect(view.textContent).not.toContain('Follow up');
});

it('shows the Session title, Back, and Model Choice in the header', async () => {
  const { view } = await open();
  expect(view.textContent).toContain('Review the release');
  const capsule = view.querySelector('[data-testid="session-header-title"]');
  expect(capsule?.getAttribute('aria-label')).toBe('Review the release');
  expect(capsule?.getAttribute('aria-description')).toBe('Session options');
  const header = view.querySelector('header');
  expect(header?.dataset).toMatchObject({
    transparent: 'true',
    topEdge: 'automatic',
    bottomEdge: 'hidden',
  });
  expect(
    view.querySelector<HTMLElement>('[data-testid="session-transcript"]')?.dataset,
  ).toMatchObject({
    dismiss: 'interactive',
    persistTaps: 'never',
  });
  await press(view, 'Back');
  expect(navigation.back).toHaveBeenCalledOnce();
  await press(view, 'Session options');
  const menu = view.querySelector<HTMLElement>('[role="menu"]')!;
  expect(menu.textContent).toBe('Model choice');
  expect(menu.querySelector('[data-testid="session-model-choice"]')).not.toBeNull();
  await press(menu, 'Model choice');
  const picker = view.querySelector('section[aria-label]');
  expect(picker).not.toBeNull();
  await unmount();
  const composer = await open();
  await act(async () =>
    composer.view.querySelector<HTMLElement>('[data-testid="composer-session-model"]')?.click(),
  );
  expect(composer.view.querySelector('section[aria-label]')?.getAttribute('aria-label')).toBe(
    picker?.getAttribute('aria-label'),
  );
});

it('keeps Model Choice disabled in the header while the Composer send is pending', async () => {
  const send = Promise.withResolvers<void>();
  const { view } = await open({ sendGate: send.promise });
  await press(view, 'Draft');
  await press(view, 'Send');
  await press(view, 'Session options');
  const choice = view.querySelector<HTMLButtonElement>('[data-testid="session-model-choice"]')!;
  expect(choice.disabled).toBe(true);
  await act(async () => choice.click());
  expect(view.querySelector('section[aria-label]')).toBeNull();
  await act(async () => send.resolve());
  expect(choice.disabled).toBe(false);
  await act(async () => choice.click());
  expect(view.querySelector('section[aria-label]')).not.toBeNull();
});

it('waits for a fresh Assignment read after archiving, even if the first refresh fails', async () => {
  const reload = Promise.withResolvers<void>();
  const { view } = await open({
    role: 'assignment',
    beforeAssignmentRead: async (read) => {
      if (read === 2) await reload.promise;
    },
  });
  const archive = () => view.querySelector('[data-testid="session-archive"]');
  const unarchive = () => view.querySelector('[data-testid="session-unarchive"]');
  await press(view, 'Session options');
  expect(archive()).not.toBeNull();
  await press(view, 'Archive');
  await press(view, 'Session options');
  expect(archive()).toBeNull();
  expect(unarchive()).toBeNull();
  await act(async () => reload.reject(new Error('Assignment refresh unavailable')));
  expect(archive()).toBeNull();
  expect(unarchive()).toBeNull();
  await press(view, 'Try again');
  expect(unarchive()?.textContent).toBe('Unarchive');
});

it('preserves the confirmed Archive action when the write is refused', async () => {
  const { view } = await open({
    role: 'assignment',
    beforeArchive: async () => {
      throw new MethodRefused('forbidden', 'Restricted Session');
    },
  });
  await press(view, 'Session options');
  await press(view, 'Archive');
  await press(view, 'Session options');
  expect(view.querySelector('[data-testid="session-archive"]')?.textContent).toBe('Archive');
  expect(view.querySelector('[data-testid="session-unarchive"]')).toBeNull();
});

it('uses the selected Assignment for Stop, Archive, and Unarchive', async () => {
  const { view, call } = await open({ role: 'assignment', running: true });
  await press(view, 'Session options');
  const menu = view.querySelector<HTMLElement>('[role="menu"]')!;
  expect(menu.textContent).toBe('StopModel choice');
  expect(menu.querySelector('[data-testid="session-stop"]')).not.toBeNull();
  await press(menu, 'Stop');
  expect(call).toHaveBeenCalledWith('sessionStop', { botSlug: 'ada', sessionId: 'chosen' });
  await press(view, 'Session options');
  await press(view.querySelector<HTMLElement>('[role="menu"]')!, 'Archive');
  expect(call).toHaveBeenCalledWith('sessionArchiveSet', {
    slug: 'ada',
    sessionId: 'chosen',
    archived: true,
  });
  await press(view, 'Session options');
  await press(view.querySelector<HTMLElement>('[role="menu"]')!, 'Unarchive');
  expect(call).toHaveBeenCalledWith('sessionArchiveSet', {
    slug: 'ada',
    sessionId: 'chosen',
    archived: false,
  });
});

it('steers and stops a running Assignment by its selected Session ID', async () => {
  const { view, call } = await open({ role: 'assignment', running: true });
  await press(view, 'Draft');
  await press(view, 'Send');
  expect(call).toHaveBeenCalledWith('botToolRun', {
    slug: 'ada',
    tool: 'unarchive_assignment',
    args: { session_id: 'chosen', message: 'Follow up', mode: 'next-step' },
  });
  await press(view, 'Stop');
  expect(call).toHaveBeenCalledWith('sessionStop', { botSlug: 'ada', sessionId: 'chosen' });
});

it('withholds the transcript, composer and model controls on a Host refusal', async () => {
  const { view, call } = await open({ refused: true });
  expect(view.textContent).toContain('This session is unavailable.');
  expect(view.querySelector('[data-testid="session-transcript"]')).toBeNull();
  expect(view.querySelector('[data-testid="composer-session-model"]')).toBeNull();
  expect(call.mock.calls.some(([method]) => method === 'sessionModel')).toBe(false);
});

it('retries only the failed Assignment detail read and keeps the transcript mounted', async () => {
  const { view, call } = await open({ role: 'assignment', failAssignment: true });
  const transcript = view.querySelector('[data-testid="session-transcript"]');
  expect(transcript?.textContent).toContain('Saved reply');
  expect(view.textContent).toContain('Couldn’t load assignment details.');
  const beforeRetry = call.mock.calls.length;

  await press(view, 'Try again');
  expect(call.mock.calls.slice(beforeRetry)).toEqual([
    [
      'assignmentTimeline',
      { slug: 'ada', sessionId: 'chosen' },
      { signal: expect.any(AbortSignal), timeoutMs: 20_000 },
    ],
  ]);
  expect(view.querySelector('[data-testid="session-transcript"]')).toBe(transcript);
  expect(view.textContent).not.toContain('Couldn’t load assignment details.');
  expect(view.querySelector('[data-testid="session-assignment-details"]')).not.toBeNull();
  expect(view.querySelector('[data-testid="session-header-title"]')?.textContent).toBe(
    'Canonical Assignment',
  );
});

it('leaves room for the overlay composer and top app bar in Android list order', () => {
  platform.OS = 'android';
  try {
    const layout = chatTimelineListLayout({
      headerOverlap: 0,
      headerPadding: 90,
      listSafeArea: 0,
      nativeSpacer: false,
      viewportHeight: 874,
      composerHeight: 76,
      ready: true,
    });
    expect(layout).toMatchObject({
      inverted: true,
      keyboardDismissMode: 'on-drag',
      contentContainerStyle: {
        paddingTop: 76 + edgeFade.bottom,
        paddingBottom: 90 + space.x3,
      },
    });
  } finally {
    platform.OS = 'ios';
  }
});

it('renders the Android Session header with Back, title, and options', async () => {
  platform.OS = 'android';
  navigation.back.mockClear();
  const { extensions } = createRequire(import.meta.url);
  const loadXml = extensions['.xml'];
  extensions['.xml'] = (asset, path) => {
    asset.exports = path;
  };
  vi.doUnmock('../src/ui/chat/chat-header-actions');
  vi.doMock('../src/ui/shell/header-icon-button', async () => {
    const android = await import('../src/ui/shell/header-icon-button.android');
    return { ...android, HeaderIconGlyph: Reflect.get(android, 'HeaderIconGlyph') };
  });
  vi.resetModules();

  try {
    const androidPreferences = await import('../src/ui/interface-preferences');
    androidPreferences.interfacePreferences.setSystemLocales(['en']);
    const { SessionDetailBody: AndroidSessionDetailBody } =
      await import('../src/ui/chat/session-detail-screen');
    const { view } = await open({
      role: 'native',
      running: true,
      pendingInput: [approval],
      Body: AndroidSessionDetailBody,
    });
    expect(view.querySelector('[data-testid="session-pending-input"]')?.textContent).toContain(
      'Allow once',
    );
    expect(buttons(view)).toContain('Stop');
    const header = view.querySelector('header');
    expect(header?.dataset['shown']).toBe('false');
    expect(header?.querySelector('[data-testid="session-header-title"]')?.textContent).toBe(
      'Review the release',
    );
    expect(header?.querySelector('[data-testid="session-options"]')).toBeNull();
    expect(
      header
        ?.querySelector('[data-testid="session-header-title"]')
        ?.getAttribute('aria-description'),
    ).toBe('Session options');
    const back = header?.querySelector<HTMLButtonElement>('button[aria-label="Back"]');
    expect(back).toBeDefined();
    await act(async () => back?.click());
    expect(navigation.back).toHaveBeenCalledOnce();
  } finally {
    if (loadXml === undefined) delete extensions['.xml'];
    else extensions['.xml'] = loadXml;
    vi.doUnmock('../src/ui/shell/header-icon-button');
    platform.OS = 'ios';
  }
});

it('accounts for the iOS safe areas while the native composer spacer reserves the bottom', () => {
  const layout = chatTimelineListLayout({
    headerOverlap: 108,
    headerPadding: 0,
    listSafeArea: 34,
    nativeSpacer: true,
    viewportHeight: 874,
    composerHeight: 76,
    ready: true,
  });
  expect(layout).toMatchObject({
    inverted: false,
    contentInset: { bottom: -34 },
    contentContainerStyle: {
      minHeight: 874 - 108,
      paddingTop: space.x3,
      paddingBottom: 0,
    },
  });
});

it('shows ☰ and ✎ at the Sessions root and opens Session options from the name capsule', async () => {
  place.segments = ['(tabs)', '(sessions)', 'session', '[id]'];
  place.index = 0;
  try {
    const { view } = await open({ role: 'native' });
    const labels = [...view.querySelectorAll('button')].map(
      (button) => button.getAttribute('aria-label') ?? button.textContent,
    );
    expect(labels).toContain('Show Sessions');
    expect(labels).toContain('New Session');
    expect(labels).not.toContain('Back');
    expect(labels).not.toContain('Session options');
    expect(view.querySelector('[data-testid="session-options"]')).toBeNull();
    await press(view, 'Session options');
    expect(view.querySelector('[data-testid="session-menu-title"]')?.textContent).toBe(
      'Review the release',
    );
    expect(view.querySelector('[role="menu"]')?.textContent).toBe('ArchiveModel choice');
    await act(async () => view.querySelector<HTMLElement>('[data-testid="session-new"]')?.click());
    expect(place.replace).toHaveBeenCalledExactlyOnceWith('/sessions');
  } finally {
    place.segments = ['(tabs)', '(home)', 'session', '[id]'];
    place.index = 1;
  }
});

it('keeps Back with ✎ for a Session pushed inside the Sessions tab, and no ✎ elsewhere', async () => {
  place.segments = ['(tabs)', '(sessions)', 'session', '[id]'];
  place.index = 1;
  try {
    const sessions = await open({ role: 'native' });
    const labels = [...sessions.view.querySelectorAll('button')].map(
      (button) => button.getAttribute('aria-label') ?? button.textContent,
    );
    expect(labels).toContain('Back');
    expect(labels).toContain('New Session');
    expect(labels).not.toContain('Show Sessions');
  } finally {
    place.segments = ['(tabs)', '(home)', 'session', '[id]'];
  }
  await unmount();
  const elsewhere = await open({ role: 'native' });
  const labels = [...elsewhere.view.querySelectorAll('button')].map(
    (button) => button.getAttribute('aria-label') ?? button.textContent,
  );
  expect(labels).not.toContain('New Session');
});

it('shows Back · capsule · ✎ at the Sessions root in Stacked style', async () => {
  interfacePreferences.setSessionNavigation('stacked');
  place.segments = ['(tabs)', '(sessions)', 'session', '[id]'];
  place.index = 1;
  place.replace.mockClear();
  try {
    const { view } = await open({ role: 'native' });
    const labels = [...view.querySelectorAll('button')].map(
      (button) => button.getAttribute('aria-label') ?? button.textContent,
    );
    expect(labels).toContain('Back');
    expect(labels).toContain('New Session');
    expect(labels).not.toContain('Show Sessions');
    await act(async () => view.querySelector<HTMLElement>('[data-testid="session-new"]')?.click());
    expect(place.replace).toHaveBeenCalledExactlyOnceWith('/new-session');
  } finally {
    interfacePreferences.setSessionNavigation('drawer');
    place.segments = ['(tabs)', '(home)', 'session', '[id]'];
  }
});

it('offers New Session from the Host that owns the open Session, not the selected one', async () => {
  place.segments = ['(tabs)', '(sessions)', 'session', '[id]'];
  place.index = 0;
  place.member = new Set(['member-host']);
  const labels = (view: HTMLElement) =>
    [...view.querySelectorAll('button')].map(
      (button) => button.getAttribute('aria-label') ?? button.textContent,
    );
  try {
    place.hostId = 'member-host';
    const member = await open({ role: 'native' });
    expect(labels(member.view)).not.toContain('New Session');
    await unmount();
    place.hostId = 'owner-host';
    const owner = await open({ role: 'native' });
    expect(labels(owner.view)).toContain('New Session');
  } finally {
    place.segments = ['(tabs)', '(home)', 'session', '[id]'];
    place.index = 1;
    place.hostId = undefined;
    place.member = new Set();
  }
});

it('shows the prompt as a pending title on a new Session until the generated title arrives', async () => {
  let title: { displayTitle?: string; titleFallback?: true } = {
    displayTitle: 'Release',
    titleFallback: true,
  };
  const { view } = await open({
    role: 'native',
    running: true,
    fresh: true,
    transcript: () => title,
  });
  const capsule = () => view.querySelector<HTMLElement>('[data-testid="session-header-title"]')!;
  expect(capsule().textContent).toBe('Release review');
  expect(capsule().dataset['pending']).toBe('true');

  title = { displayTitle: 'Release checklist' };
  await press(view, 'Draft');
  await press(view, 'Send');
  expect(capsule().textContent).toBe('Release checklist');
  expect(capsule().dataset['pending']).toBe('false');
  expect(capsule().getAttribute('aria-label')).toBe('Release checklist');
});

it('shows the Host and worktree folder under a native Session title', async () => {
  const { view } = await open({
    role: 'native',
    transcript: () => ({ displayTitle: 'Release', cwd: '/Users/me/worktrees/app-5187' }),
  });
  const capsule = view.querySelector<HTMLElement>('[data-testid="session-header-title"]')!;
  expect(capsule.dataset['host']).toBe('Computer');
  expect(capsule.dataset['folder']).toBe('app-5187');
  expect(capsule.dataset['path']).toBe('/Users/me/worktrees/app-5187');
});

it('never marks an opened existing Session title as pending', async () => {
  const { view } = await open({
    role: 'native',
    running: true,
    transcript: () => ({ displayTitle: 'Release', titleFallback: true }),
  });
  const capsule = view.querySelector<HTMLElement>('[data-testid="session-header-title"]')!;
  expect(capsule.textContent).toBe('Release');
  expect(capsule.dataset['pending']).toBe('false');
});
