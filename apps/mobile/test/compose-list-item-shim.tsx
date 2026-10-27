import { createElement, type ReactNode } from 'react';

type Modifier = { onClick?: () => void; toggled?: boolean; role?: string; enabled?: boolean };
type Children = { children?: ReactNode };
const pass = ({ children }: Children) => children ?? null;
const slot =
  (name: string) =>
  ({ children }: Children) =>
    createElement('span', { 'data-slot': name }, children);

export const components = {
  Host: ({ children, matchContents }: Children & { matchContents?: { vertical?: boolean } }) =>
    createElement(
      'div',
      { 'data-host': matchContents?.vertical === true ? 'match-vertical' : 'fixed' },
      children,
    ),
  ListItem: Object.assign(
    ({
      children,
      modifiers = [],
      colors,
    }: Children & { modifiers?: Modifier[]; colors?: { containerColor?: string } }) => {
      const action = modifiers.find((modifier) => modifier.onClick);
      return createElement(
        'div',
        {
          'data-list-item': '',
          'data-fill': colors?.containerColor,
          'data-toggle-role': action?.role,
          'data-enabled': action?.enabled === false ? 'false' : undefined,
          onClick: action?.enabled === false ? undefined : action?.onClick,
        },
        children,
      );
    },
    {
      HeadlineContent: slot('headline'),
      SupportingContent: slot('supporting'),
      LeadingContent: slot('leading'),
      TrailingContent: slot('trailing'),
    },
  ),
  Text: ({ children, color }: Children & { color?: string }) =>
    createElement('span', { 'data-color': color }, children),
  Icon: ({ source, tint }: { source: string; tint?: string }) =>
    createElement('i', { 'data-icon': source, 'data-tint': tint }),
  Switch: ({ value, enabled }: { value: boolean; enabled?: boolean }) =>
    createElement('input', {
      type: 'checkbox',
      'data-native-switch': '',
      checked: value,
      disabled: enabled === false,
      readOnly: true,
    }),
  CircularProgressIndicator: () => createElement('progress', { 'data-native-busy': '' }),
  RNHostView: pass,
  Row: pass,
};

export const modifiers = {
  clickable: (onClick: () => void) => ({ onClick }),
  toggleable: (
    toggled: boolean,
    onClick: () => void,
    options?: { role?: string; enabled?: boolean },
  ) => ({ toggled, onClick, ...options }),
  size: () => ({}),
};

export const rowIconSources = new Proxy({}, { get: (_target, name) => `row-icon:${String(name)}` });
