// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { createConversationPlayback, type BubblePlayback } from '../src/host/conversation-playback';
import type { ConversationSnapshot } from '../src/host/conversation';
import { useReplyHaptic } from '../src/ui/chat/reply-haptic';
import { haptic, setHapticsEnabled, type HapticMoment } from '../src/ui/haptics';
import { played } from './expo-haptics-shim';

const native = vi.hoisted(() => ({ os: 'ios', state: 'active' }));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return native.os;
    },
  },
  AppState: {
    get currentState() {
      return native.state;
    },
  },
}));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('../src/ui/haptic-effect', async (importOriginal) => {
  const ios = await importOriginal<typeof import('../src/ui/haptic-effect')>();
  const android = await import('../src/ui/haptic-effect.android');
  return {
    playHaptic: (moment: HapticMoment) =>
      native.os === 'android' ? android.playHaptic(moment) : ios.playHaptic(moment),
  };
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  played.length = 0;
  native.os = 'ios';
  native.state = 'active';
  setHapticsEnabled(true);
});

function fixture() {
  const source: ConversationSnapshot = {
    status: 'live',
    messages: [],
    drafts: [],
    hasOlder: false,
    loadingOlder: false,
    fromCache: false,
  };
  return createConversationPlayback({
    getSnapshot: () => source,
    getTimelineSnapshot: () => source,
    subscribe: () => () => {},
  });
}

function bubble(body: string, streaming = true): BubblePlayback {
  return {
    streaming,
    message: {
      id: 'draft:d1',
      at: '',
      author: 'bot',
      bot: 'ada',
      body,
      attachments: [],
      delivery: 'pending',
    },
  };
}

it.each(['ios', 'android'])(
  'gives %s one haptic at the first reply text, across row remount and commit',
  async (os) => {
    native.os = os;
    const playback = fixture();
    const root = createRoot(document.createElement('div'));
    function Probe({ snapshot, focused = true }: { snapshot: BubblePlayback; focused?: boolean }) {
      useReplyHaptic(playback, 'draft:d1', snapshot, focused);
      return null;
    }
    await act(async () => root.render(<Probe snapshot={bubble('')} />));
    expect(played).toEqual([]);
    await act(async () => root.render(<Probe snapshot={bubble('Hello')} />));
    const expected = os === 'android' ? 'android:context-click' : 'impact:light';
    expect(played).toEqual([expected]);
    await act(async () => root.render(<Probe snapshot={bubble('Hello there')} />));
    await act(async () => root.render(null));
    await act(async () => root.render(<Probe snapshot={bubble('Hello there')} />));
    await act(async () => root.render(<Probe snapshot={bubble('Hello there', false)} />));
    expect(played).toEqual([expected]);
    await act(async () => root.unmount());
  },
);

it('does not buzz for history, inactive chats, or background replies on return', async () => {
  const playback = fixture();
  const root = createRoot(document.createElement('div'));
  function Probe({
    id,
    focused,
    snapshot,
  }: {
    id: string;
    focused: boolean;
    snapshot: BubblePlayback;
  }) {
    useReplyHaptic(playback, id, snapshot, focused);
    return null;
  }
  await act(async () =>
    root.render(<Probe id="old" focused snapshot={bubble('History', false)} />),
  );
  await act(async () =>
    root.render(<Probe id="hidden" focused={false} snapshot={bubble('Reply')} />),
  );
  await act(async () => root.render(<Probe id="hidden" focused snapshot={bubble('Reply')} />));
  native.state = 'background';
  await act(async () =>
    root.render(<Probe id="background" focused snapshot={bubble('Reply', false)} />),
  );
  native.state = 'active';
  await act(async () =>
    root.render(<Probe id="background" focused snapshot={bubble('Reply more')} />),
  );
  expect(played).toEqual([]);
  await act(async () =>
    root.render(<Probe id="next-reply" focused snapshot={bubble('New reply')} />),
  );
  expect(played).toEqual(['impact:light']);
  await act(async () => root.unmount());
});

it('maps existing Android actions to native haptics and keeps iOS feedback', () => {
  native.os = 'android';
  for (const moment of ['send', 'submit', 'menu', 'pull', 'react', 'approve', 'deny'] as const)
    haptic(moment);
  expect(played).toEqual([
    'android:context-click',
    'android:context-click',
    'android:context-click',
    'android:context-click',
    'android:context-click',
    'android:confirm',
    'android:reject',
  ]);
  played.length = 0;
  native.os = 'ios';
  haptic('send');
  haptic('approve');
  haptic('deny');
  expect(played).toEqual(['impact:light', 'notification:success', 'notification:warning']);
});

it.each(['ios', 'android'])(
  'respects disabled touch feedback on %s without replaying it later',
  async (os) => {
    native.os = os;
    const playback = fixture();
    const root = createRoot(document.createElement('div'));
    function Probe({ id }: { id: string }) {
      useReplyHaptic(playback, id, bubble('Reply'), true);
      return null;
    }
    setHapticsEnabled(false);
    await act(async () => root.render(<Probe id="muted" />));
    expect(played).toEqual([]);
    setHapticsEnabled(true);
    await act(async () => root.render(<Probe id="muted" />));
    expect(played).toEqual([]);
    await act(async () => root.render(<Probe id="next" />));
    expect(played).toEqual([os === 'android' ? 'android:context-click' : 'impact:light']);
    await act(async () => root.unmount());
  },
);
