import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCallActivity,
  type CallActivityHandle,
  type CallActivityProps,
} from '../src/ui/chat/call-activity';

const disk = vi.hoisted(() => ({ files: new Set<string>(), os: 'ios' }));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return disk.os;
    },
  },
}));
vi.mock('expo-application', () => ({
  applicationId: 'app.deepseekbot.mobile.dev',
}));
vi.mock('expo-file-system', () => {
  const join = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return disk.files.has(this.uri);
    }
  }
  return {
    Directory,
    File,
    Paths: {
      document: new Directory('file:///documents'),
      appleSharedContainers: {
        'group.app.deepseekbot.mobile.dev': new Directory('file:///group'),
      },
    },
  };
});
vi.mock('expo-image', () => ({ Image: {} }));
vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: {},
  SaveFormat: {},
}));
vi.mock('expo-alternate-app-icons', () => ({
  getAppIconName: () => null,
  setAlternateAppIcon: async () => undefined,
  supportsAlternateIcons: true,
}));
vi.mock('../src/ui/native-app-icon', () => ({
  nativeAppIcon: { current: () => 'default' },
  appIconPreviews: { default: { light: 1, dark: 2 } },
}));
vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));

beforeEach(() => {
  disk.files.clear();
  disk.os = 'ios';
});

describe('call Live Activity avatar', () => {
  const avatar = 'file:///group/notification-avatars/host-1/bot-mira.png';

  it('points at the Bot avatar the notifications already rendered into the App Group', async () => {
    const { callAvatarUri } = await import('../src/host/native-call-activity-images');
    expect(callAvatarUri('host-1', 'mira')).toBeUndefined();
    disk.files.add(avatar);
    expect(callAvatarUri('host-1', 'mira')).toBe(avatar);
    expect(callAvatarUri('host-2', 'mira')).toBeUndefined();
    disk.os = 'android';
    expect(callAvatarUri('host-1', 'mira')).toBeUndefined();
  });

  it('updates the activity once the avatar and app icon badge arrive', async () => {
    const updates: CallActivityProps[] = [];
    const handle: CallActivityHandle = {
      update: async (next) => {
        updates.push(next);
      },
      end: async () => undefined,
    };
    const activity = createCallActivity({ start: async () => handle });
    const props = (patch: Partial<CallActivityProps> = {}): CallActivityProps => ({
      name: 'Mira',
      phase: 'listening',
      startedAt: 1_000,
      muted: false,
      locale: 'en',
      avatarColor: '#335577',
      avatarInk: '#ffffff',
      ...patch,
    });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    activity.sync(props());
    await flush();
    activity.sync(props());
    await flush();
    expect(updates).toEqual([]);
    activity.sync(props({ avatar }));
    await flush();
    activity.sync(
      props({
        avatar,
        badge: 'file:///light.png',
        badgeDark: 'file:///dark.png',
      }),
    );
    await flush();
    expect(updates.map((update) => [update.avatar, update.badge, update.badgeDark])).toEqual([
      [avatar, undefined, undefined],
      [avatar, 'file:///light.png', 'file:///dark.png'],
    ]);
  });

  it('leads with the avatar and drops the standalone phone symbol', () => {
    const widget = readFileSync(
      new URL('../src/ui/widgets/call-activity.tsx', import.meta.url),
      'utf8',
    );
    expect(widget).not.toContain('phone.fill"');
    expect(widget).toContain('compactLeading: portrait(');
    expect(widget).toContain('minimal: portrait(');
    expect(widget).toContain('uiImage={props.avatar}');
  });
});
