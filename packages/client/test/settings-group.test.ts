// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/client/channel-sidebar-icon.js', () => ({
  ChannelSidebarIcon: () => createElement('svg'),
}));

import {
  SettingsGroupPart,
  SettingsRow,
  SettingsRows,
  SettingsSection,
} from '../src/client/ds/settings-row.js';
import { StatusBlock, StatusDisclosure } from '../src/client/ds/status-block.js';
import { SidebarCardList } from '../src/client/sidebar-card.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(node: ReactNode): void {
  act(() => root.render(node));
}

function rowsOf(group: Element): Element[] {
  return [...group.querySelectorAll('[data-settings-row]')].filter(
    (row) => row.parentElement?.closest('[data-settings-group]') === group,
  );
}

function wrapperOf(row: Element): Element | undefined {
  let parent = row.parentElement;
  while (parent && !parent.hasAttribute('data-settings-group')) {
    if (!parent.hasAttribute('data-settings-part')) return parent;
    parent = parent.parentElement;
  }
  return undefined;
}

describe('settings groups', () => {
  it('renders status blocks and disclosures inside a section as plain rows', () => {
    render(
      createElement(SettingsSection, {
        title: 'Existing connections',
        children: [
          createElement(StatusBlock, {
            key: 'host',
            icon: 'monitor',
            tone: 'accent',
            title: 'vm',
            body: 'This computer',
          }),
          createElement(StatusDisclosure, {
            key: 'more',
            icon: 'server',
            title: 'Nearby computers',
            open: false,
            onToggle: () => undefined,
            children: null,
          }),
        ],
      }),
    );
    const group = host.querySelector('[data-settings-group]')!;
    const rows = rowsOf(group);
    expect(rows.map((row) => row.textContent)).toEqual(['vmThis computer', 'Nearby computers']);
    for (const row of rows) {
      expect(wrapperOf(row)).toBeUndefined();
      expect(row.querySelector('svg')?.closest('[data-settings-row]') === row).toBe(
        row.tagName === 'BUTTON',
      );
    }
  });

  it('keeps the icon badge on a status block outside a group', () => {
    render(createElement(StatusBlock, { icon: 'monitor', tone: 'accent', title: 'vm' }));
    expect(host.querySelector('[data-settings-row]')).toBeNull();
    expect(host.querySelector('svg')).not.toBeNull();
  });

  it('keeps rows in lists and parts direct members of their group', () => {
    render(
      createElement(SettingsRows, {
        children: [
          createElement(SettingsRow, { key: 'mode', title: 'Team mode' }),
          createElement(SettingsGroupPart, {
            key: 'roles',
            role: 'list',
            label: 'Roles',
            children: createElement(SettingsGroupPart, {
              role: 'listitem',
              children: createElement(SettingsRow, { title: 'Admin' }),
            }),
          }),
          createElement(SidebarCardList, {
            key: 'apps',
            label: 'Apps',
            children: createElement(SettingsRow, { title: 'Lark' }),
          }),
        ],
      }),
    );
    const group = host.querySelector('[data-settings-group]')!;
    const rows = rowsOf(group);
    expect(rows.map((row) => row.textContent)).toEqual(['Team mode', 'Admin', 'Lark']);
    for (const row of rows) expect(wrapperOf(row)).toBeUndefined();
    expect(group.querySelector('[data-settings-group]')).toBeNull();
  });

  it('clips row corners to the group and draws separators only between rows', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/client/ds/settings-row.tsx'),
      'utf8',
    );
    expect(source).toMatch(/overflow: 'clip'/);
    expect(source).not.toMatch(
      /':(?:first|last)-child'\s*:\s*\{?\s*\w*Radius|borderStartStartRadius|borderEndEndRadius/,
    );
    expect(source).not.toMatch(/':last-of-type'/);
    expect(source).toMatch(/:has\(~ :is\(\[data-settings-row\], \[data-settings-part\]\)\)/);
  });
});
