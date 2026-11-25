// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const roles = vi.hoisted(() => ({ outlineVariant: '#c4c7c5ff', options: [] as unknown[] }));

vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return { ...shim, Platform: { ...shim.Platform, OS: 'android' } };
});
vi.mock('@expo/ui/jetpack-compose', () => ({
  useMaterialColors: (options: unknown) => {
    roles.options.push(options);
    return { outlineVariant: roles.outlineVariant };
  },
}));
vi.mock('../src/ui/chat/composer-outline', () => import('../src/ui/chat/composer-outline.android'));

const { ComposerFieldMaterial, composerPillShadow } =
  await import('../src/ui/chat/composer-chrome');
const { resolveTheme } = await import('../src/ui/design/resolve-theme');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('edges the Android Composer with a 1dp outline-variant hairline and no shadow', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<ComposerFieldMaterial cornerRadius={28} />));
  const style = JSON.parse(host.querySelector('[data-style]')!.getAttribute('data-style')!);
  const flat = Object.assign({}, ...style.filter(Boolean));
  const theme = resolveTheme('light', {}, 'android');
  expect(flat).toMatchObject({
    borderRadius: 28,
    borderWidth: 1,
    borderColor: roles.outlineVariant,
    backgroundColor: theme.layer.raised.fill,
  });
  expect(flat.boxShadow).toBeUndefined();
  expect(composerPillShadow(theme)).toBeUndefined();
  await act(async () => root.unmount());
});
