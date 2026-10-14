import { createElement, Fragment, type ReactNode } from 'react';

type Props = Record<string, unknown> & { children?: ReactNode };

function a11y(props: Props): Record<string, unknown> {
  const state = (props['accessibilityState'] ?? {}) as Record<string, unknown>;
  return {
    ...(props['testID'] === undefined ? {} : { 'data-testid': props['testID'] }),
    ...(props['accessibilityRole'] === undefined ? {} : { role: props['accessibilityRole'] }),
    ...(props['accessibilityLabel'] === undefined
      ? {}
      : { 'aria-label': props['accessibilityLabel'] }),
    ...(state['checked'] === undefined ? {} : { 'aria-checked': String(state['checked']) }),
  };
}

export const View = (props: Props) =>
  createElement('div', { ...a11y(props), ref: props['ref'] }, props.children);
export const Text = (props: Props) => createElement('span', a11y(props), props.children);
export const ScrollView = View;
export const ActivityIndicator = () => createElement('span', { role: 'progressbar' });
export const RefreshControl = () => null;
export const Image = () => createElement('img');

export const Pressable = (props: Props) =>
  createElement(
    'button',
    {
      ...a11y(props),
      type: 'button',
      disabled: props['disabled'] === true,
      onClick: () => (props['onPress'] as (() => void) | undefined)?.(),
    },
    props.children,
  );

export const TextInput = (props: Props) =>
  createElement('textarea', {
    ...a11y(props),
    value: props['value'] as string,
    placeholder: props['placeholder'] as string,
    disabled: props['editable'] === false,
    onChange: (event: { target: { value: string } }) =>
      (props['onChangeText'] as ((text: string) => void) | undefined)?.(event.target.value),
  });

interface Section {
  data: unknown[];
  [key: string]: unknown;
}

export const SectionList = (props: {
  sections: Section[];
  keyExtractor(item: unknown): string;
  renderItem(info: { item: unknown }): ReactNode;
  renderSectionHeader?(info: { section: Section }): ReactNode;
  renderSectionFooter?(info: { section: Section }): ReactNode;
  ListHeaderComponent?: ReactNode;
  ref?: unknown;
}) =>
  createElement(
    'div',
    { ref: props.ref },
    props.ListHeaderComponent ?? null,
    ...props.sections.map((section, index) =>
      createElement(
        'section',
        { key: index },
        props.renderSectionHeader?.({ section }) ?? null,
        ...section.data.map((item) =>
          createElement(Fragment, { key: props.keyExtractor(item) }, props.renderItem({ item })),
        ),
        props.renderSectionFooter?.({ section }) ?? null,
      ),
    ),
  );

export const useColorScheme = () => 'light';
export const Linking = { openURL: async () => undefined };
export const AppState = { addEventListener: () => ({ remove() {} }) };
export const Keyboard = {
  addListener: () => ({ remove() {} }),
  isVisible: () => false,
  metrics: () => undefined,
  dismiss() {},
};
export const Platform = {
  OS: 'web',
  select: <T>(options: { default?: T; web?: T }) => options.web ?? options.default,
};

export const Switch = (props: Props) =>
  createElement('input', {
    ...a11y(props),
    type: 'checkbox',
    role: 'switch',
    checked: props['value'] === true,
    disabled: props['disabled'] === true,
    onChange: () =>
      (props['onValueChange'] as ((value: boolean) => void) | undefined)?.(props['value'] !== true),
  });

export const FlatList = (props: {
  data: unknown[];
  keyExtractor(item: unknown): string;
  renderItem(info: { item: unknown; index: number }): ReactNode;
  ListEmptyComponent?: ReactNode;
  ref?: unknown;
}) =>
  createElement(
    'div',
    { ref: props.ref },
    ...(props.data.length === 0
      ? [props.ListEmptyComponent ?? null]
      : props.data.map((item, index) =>
          createElement(
            Fragment,
            { key: props.keyExtractor(item) },
            props.renderItem({ item, index }),
          ),
        )),
  );
