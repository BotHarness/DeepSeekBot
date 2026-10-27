import { createElement, type ReactNode } from 'react';

type Modifier = Record<string, unknown> & { handler?: () => void };
type Props = Record<string, unknown> & { children?: ReactNode; modifiers?: Modifier[] };

function node(name: string) {
  return function Compose(props: Props) {
    const { children, modifiers = [], ...rest } = props;
    const handler =
      (rest['onClick'] as (() => void) | undefined) ??
      modifiers.find((modifier) => modifier.handler)?.handler;
    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(rest))
      if (typeof value !== 'function')
        data[`data-${key.toLowerCase()}`] =
          typeof value === 'string' ? value : JSON.stringify(value);
    const enabled = rest['enabled'] !== false;
    return createElement(
      'div',
      {
        'data-compose': name,
        'data-modifiers': JSON.stringify(modifiers),
        ...data,
        ...(handler && enabled ? { onClick: handler } : {}),
      },
      children,
    );
  };
}

const slot = (name: string) => node(`slot:${name}`);

export const compose = {
  Host: node('Host'),
  Card: node('Card'),
  Column: node('Column'),
  Row: node('Row'),
  FlowRow: node('FlowRow'),
  Box: node('Box'),
  Text: node('Text'),
  TextButton: node('TextButton'),
  Button: node('FilledButton'),
  FilledTonalButton: node('FilledTonalButton'),
  Icon: node('Icon'),
  CircularProgressIndicator: node('CircularProgressIndicator'),
  LoadingIndicator: node('LoadingIndicator'),
  Checkbox: node('Checkbox'),
  RadioButton: node('RadioButton'),
  Badge: node('Badge'),
  BadgedBox: Object.assign(node('BadgedBox'), { Badge: slot('badge') }),
  TextField: Object.assign(
    (props: Props & { value: { get(): string }; onValueChange(next: string): void }) =>
      createElement(
        'div',
        {},
        createElement('textarea', {
          'data-compose': 'TextField',
          'data-modifiers': JSON.stringify(props.modifiers ?? []),
          disabled: props['enabled'] === false,
          value: props.value.get(),
          onChange: (event: { target: { value: string } }) =>
            props.onValueChange(event.target.value),
        }),
        props.children,
      ),
    { Label: slot('label'), Placeholder: slot('placeholder') },
  ),
  RNHostView: node('RNHostView'),
  useNativeState: (initial: string) => {
    let current = initial;
    return {
      get: () => current,
      set: (next: string) => {
        current = next;
      },
    };
  },
  useMaterialColors: () => ({
    primary: 'role:primary',
    onPrimary: 'role:onPrimary',
    error: 'role:error',
    onError: 'role:onError',
    outline: 'role:outline',
    surface: 'role:surface',
    surfaceContainerLow: 'role:surfaceContainerLow',
    surfaceContainerHighest: 'role:surfaceContainerHighest',
    onSurfaceVariant: 'role:onSurfaceVariant',
  }),
};

const plain =
  (name: string) =>
  (...args: unknown[]) => ({ [name]: args.length === 1 ? args[0] : args });

export const modifiers = {
  Shapes: { RoundedCorner: (radius: number) => ({ roundedCorner: radius }) },
  background: plain('background'),
  border: plain('border'),
  clip: plain('clip'),
  defaultMinSize: plain('defaultMinSize'),
  fillMaxSize: () => ({ fillMaxSize: true }),
  fillMaxWidth: () => ({ fillMaxWidth: true }),
  padding: plain('padding'),
  paddingAll: plain('paddingAll'),
  selectableGroup: () => ({ selectableGroup: true }),
  semantics: plain('semantics'),
  size: plain('size'),
  testID: plain('testID'),
  weight: plain('weight'),
  clickable: (handler: () => void) => ({ clickable: true, handler }),
  toggleable: (
    value: boolean,
    handler: () => void,
    options: { role?: string; enabled?: boolean } = {},
  ) => ({ toggleable: { value, ...options }, ...(options.enabled === false ? {} : { handler }) }),
};

export const theme = {
  scheme: 'light',
  touch: 48,
  mono: 'Menlo',
  color: {
    accent: 'accent',
    warning: 'warning',
    warningSoft: 'warningSoft',
    success: 'success',
    danger: 'danger',
  },
};
