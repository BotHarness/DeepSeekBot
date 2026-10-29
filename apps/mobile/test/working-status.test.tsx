import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-image', () => ({ Image: () => null }));

import type { RosterBot } from '../src/host/client';

vi.mock('react-native', async () => {
  const { useWindowDimensions, StyleSheet } = await import('./react-native-shim');
  const host = (name: string) => {
    const Component = ({ children, ...props }: Record<string, unknown>) => {
      const attributes: Record<string, string> = {};
      for (const key of ['accessibilityLabel', 'accessibilityRole', 'testID'])
        if (props[key] !== undefined) attributes[`data-${key.toLowerCase()}`] = String(props[key]);
      const content =
        typeof children === 'function' ? (children as (s: object) => unknown)({}) : children;
      return (
        <div data-native={name} {...attributes}>
          {content as never}
        </div>
      );
    };
    return Component;
  };
  return {
    useWindowDimensions,
    Dimensions: {
      get: useWindowDimensions,
      addEventListener: (_event: string, _changed: () => void) => ({ remove() {} }),
    },
    StyleSheet,
    View: host('View'),
    Text: host('Text'),
    Pressable: host('Pressable'),
    Image: host('Image'),
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options['ios'] },
    useColorScheme: () => 'light',
  };
});
vi.mock('react-native-svg', () => ({
  default: () => null,
  Path: () => null,
  Rect: () => null,
  SvgXml: () => null,
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));

vi.mock('../src/ui/chat/header-chrome', () => ({ titleChipFill: () => ({}) }));
vi.mock('../src/ui/chat/native-header', () => ({ barLabelStyle: {} }));
vi.mock('../src/ui/primitives/connection-progress', () => ({ ConnectionProgress: () => null }));
vi.mock('../src/ui/chat/group-mark', () => ({ GroupMark: () => null }));

const { WorkingStatus, workingLabel } = await import('../src/ui/chat/working-status');
const { ChatTitle } = await import('../src/ui/chat/chat-title');
const { ChannelTitle } = await import('../src/ui/chat/channel-title');
const { stepLabel } = await import('../src/ui/chat/bot-steps');
const { t } = await import('../src/ui/strings');

const bot = (slug: string, displayName: string, extra: Partial<RosterBot> = {}): RosterBot => ({
  slug,
  displayName,
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'working',
  paused: false,
  dmChannelId: `dm-${slug}`,
  ...extra,
});
const mika = bot('mika', 'Mika', {
  activity: { effect: 'executing', toolName: 'bash', activeToolCount: 1 },
});

describe('working status', () => {
  it('replaces a busy DM name with its step while preserving accessible identity', () => {
    const html = renderToStaticMarkup(
      <ChatTitle bot={mika} fallback="missing" onPress={() => {}} />,
    );
    expect(html).toContain(`>${t.effect.executing} · bash<`);
    expect(html).not.toContain('>Mika<');
    expect(html).toContain(`data-accessibilitylabel="Mika, ${t.effect.executing} · bash`);
    const idle = renderToStaticMarkup(
      <ChatTitle bot={{ ...mika, state: 'idle' }} fallback="missing" onPress={() => {}} />,
    );
    expect(idle).toContain('>Mika<');
    const paused = renderToStaticMarkup(
      <ChatTitle bot={{ ...mika, paused: true }} fallback="missing" onPress={() => {}} />,
    );
    expect(paused).toContain('>Mika<');
  });
  it('keeps a group name alongside the activity avatars', () => {
    const html = renderToStaticMarkup(
      <ChannelTitle channel={undefined} fallback="QA group" working={[mika]} onPress={() => {}} />,
    );
    expect(html).toContain('>QA group<');
    expect(html).toContain('data-testid="working-status"');
    expect(html).toContain('Mika');
  });
  it('shows the avatar and the current step without a name or a Stop button', () => {
    const html = renderToStaticMarkup(<WorkingStatus bots={[mika]} />);
    expect(html).not.toContain(`>${t.effect.executing} · bash…<`);
    expect(html).not.toContain('>Mika<');
    expect(html).not.toContain('data-accessibilityrole="button"');
    expect(html).toContain(`data-accessibilitylabel="Mika: ${t.effect.executing} · bash"`);
  });

  it('stacks at most three avatars in one row with a shared label', () => {
    const crew = [mika, bot('ada', 'Ada'), bot('kai', 'Kai'), bot('zed', 'Zed')];
    const html = renderToStaticMarkup(<WorkingStatus bots={crew} />);
    expect(html.match(/data-testid="working-status"/g)).toHaveLength(1);
    expect(html).toContain(`data-accessibilitylabel="Mika, Ada, Kai: ${t.state.working}"`);
    expect(workingLabel(crew)).toBe(t.state.working);
  });

  it('renders nothing when no Bot works', () => {
    expect(renderToStaticMarkup(<WorkingStatus bots={[]} />)).toBe('');
  });

  it('labels the step by its effect, tool and detail', () => {
    expect(stepLabel(undefined, 'working')).toBe(t.state.working);
    expect(stepLabel({ effect: 'thinking-dots', activeToolCount: 0 }, 'thinking')).toBe(
      t.state.thinking,
    );
  });
});
