// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ options: undefined as Record<string, unknown> | undefined }));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-router', () => ({
  useFocusEffect: () => {},
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      captured.options = options;
      return null;
    },
  },
}));

const { TabNativeHeader } = await import('../src/ui/shell/tab-native-header');

function options(glass: boolean) {
  renderToStaticMarkup(
    <TabNativeHeader title="Chats" leading={createElement('span')} glass={glass} />,
  );
  const result = captured.options! as {
    headerTransparent?: boolean;
    headerStyle?: object;
    scrollEdgeEffects?: object;
    unstable_headerLeftItems: () => { hidesSharedBackground: boolean }[];
  };
  const left = result.unstable_headerLeftItems();
  return { ...result, left: left[0] };
}

describe('Chats native header', () => {
  it('keeps the bar translucent before Liquid Glass so returning from a chat never relayouts', () => {
    const header = options(false);
    expect(header.headerTransparent).toBe(true);
    expect(header.headerStyle).toHaveProperty('backgroundColor');
    expect(header.scrollEdgeEffects).toBeUndefined();
    expect(header.left?.hidesSharedBackground).toBe(true);
  });

  it('floats glass chips over a soft scroll edge on Liquid Glass', () => {
    const header = options(true);
    expect(header.headerTransparent).toBe(true);
    expect(header.headerStyle).toEqual({});
    expect(header.scrollEdgeEffects).toMatchObject({ top: 'soft', bottom: 'soft' });
    expect(header.left?.hidesSharedBackground).toBe(false);
  });
});
