// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('../src/ui/primitives/drawer-material', () => ({ useLiquidGlass: () => false }));
vi.mock('../src/ui/design/theme', async () => {
  const { resolveTheme } = await import('../src/ui/design/resolve-theme');
  return { useDesignTheme: () => ({ ...resolveTheme('light'), largeText: true, fontScale: 3 }) };
});
vi.mock('../src/ui/primitives/text', () => ({
  Text: (props: { children: ReactNode; numberOfLines?: number; ellipsizeMode?: string }) => (
    <span data-lines={props.numberOfLines} data-ellipsis={props.ellipsizeMode}>
      {props.children}
    </span>
  ),
}));
vi.mock('../src/ui/shell/host-tile', () => ({
  HostTile: ({ hostName, icon }: { hostName: string; icon: unknown }) => (
    <i aria-label={hostName} data-icon={JSON.stringify(icon)} />
  ),
}));
vi.mock('../src/ui/primitives/drawer-list-item', () => ({
  DrawerListItem: (props: import('../src/ui/primitives/drawer-list-item').DrawerListItemProps) => (
    <button
      aria-label={props.accessibilityLabel}
      onClick={props.onPress}
      data-single-line={props.singleLine}
      data-dot={props.detailDot}
    >
      {props.leading}
      {props.label} {props.detail}
    </button>
  ),
}));
vi.mock('../src/ui/primitives/settings-row', () => ({
  SettingsRow: (props: import('../src/ui/primitives/settings-row').SettingsRowProps) => (
    <div>
      <button
        aria-label={props.accessibilityLabel}
        onClick={props.onPress}
        data-single-line={props.singleLine}
        data-dot={props.detailDot}
      >
        {props.leading}
        {props.title} {props.detail}
      </button>
      {props.accessory}
    </div>
  ),
}));
vi.mock('../src/ui/primitives/app-dialog', () => ({
  showActionMenu: (_name: string, actions: { onPress(): void }[]) => actions[0]!.onPress(),
}));

import { Platform } from 'react-native';
import {
  AccountComputerRow,
  ComputerRowLabel,
  computerStatusDot,
} from '../src/ui/shell/computer-row';
import { resolveTheme } from '../src/ui/design/resolve-theme';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanups: (() => void)[] = [];
const originalOS = Platform.OS;
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  Platform.OS = originalOS;
});
function mount(content: ReactNode) {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(content));
  cleanups.push(() => act(() => root.unmount()));
  return node;
}

describe('computer identity rows', () => {
  it('keeps the shared title to one ellipsized line without dropping the full text', () => {
    const name = '非常长的电脑名称 — studio '.repeat(20);
    const node = mount(<ComputerRowLabel name={name} status="Online" dot="green" />);
    expect(node.querySelector('[data-ellipsis="tail"]')?.textContent).toBe(name);
    expect(node.querySelector('[data-ellipsis="tail"]')?.getAttribute('data-lines')).toBe('1');
    expect(node.querySelectorAll('span')).toHaveLength(2);
    expect(node.textContent).toContain('Online');
  });

  it.each(['ios', 'android'] as const)(
    '%s account rows expose local identity, status and customization in both sections',
    (os) => {
      Platform.OS = os;
      for (const form of [false, true]) {
        for (const online of [false, true]) {
          const pair = vi.fn();
          const customize = vi.fn();
          const name = 'My long local studio name '.repeat(8);
          const icon = { kind: 'emoji' as const, emoji: '🏠' };
          const status = online ? t.pairAccount.online : t.pairAccount.offline;
          const node = mount(
            <AccountComputerRow
              host={{ id: 'remote', hostname: 'remote.example', name: 'Remote name', online }}
              look={{ name, icon }}
              form={form}
              onPress={pair}
              onCustomize={customize}
            />,
          );
          const row = Array.from(node.querySelectorAll('button')).find((button) =>
            button.getAttribute('aria-label')?.includes(status),
          )!;
          expect(row.getAttribute('aria-label')).toContain(name);
          expect(row.textContent).toContain(status);
          expect(row.textContent).not.toContain('Remote name');
          expect(node.querySelector('i')?.getAttribute('data-icon')).toBe(JSON.stringify(icon));
          if (form || os === 'android') {
            expect(row.getAttribute('data-single-line')).toBe('true');
            expect(row.getAttribute('data-dot')).toBe(
              online ? resolveTheme('light').color.success : resolveTheme('light').color.danger,
            );
          } else expect(node.querySelector('[data-ellipsis="tail"]')).not.toBeNull();
          act(() => row.click());
          expect(pair).toHaveBeenCalledOnce();
          const menu = Array.from(node.querySelectorAll('button')).find(
            (button) => button.getAttribute('aria-label') === t.hostMore(name),
          )!;
          act(() => menu.click());
          expect(customize).toHaveBeenCalledOnce();
          expect(pair).toHaveBeenCalledOnce();
        }
      }
    },
  );

  it('uses green, yellow and red for online, checking and offline', () => {
    const theme = resolveTheme('light');
    expect(computerStatusDot(theme, 'online')).toBe(theme.color.success);
    expect(computerStatusDot(theme, 'checking')).toBe(theme.color.warning);
    expect(computerStatusDot(theme, 'offline')).toBe(theme.color.danger);
  });
});
