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
    ...(state['selected'] === undefined ? {} : { 'aria-selected': String(state['selected']) }),
  };
}

export const View = (props: Props) =>
  createElement('div', { ...a11y(props), ref: props['ref'] }, props.children);
export const Text = (props: Props) => createElement('span', a11y(props), props.children);
export const ScrollView = View;
export const Animated = {
  View,
  Value: class {
    constructor(readonly value: number) {}
    interpolate({ outputRange }: { outputRange: unknown[] }) {
      return outputRange[0];
    }
  },
};
export const I18nManager = { isRTL: false };
export const KeyboardAvoidingView = View;
export const Modal = (props: Props) =>
  props['visible'] === true ? createElement('div', { role: 'dialog' }, props.children) : null;
export const useWindowDimensions = () => ({ width: 390, height: 844, scale: 3, fontScale: 1 });
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
    onBlur: props['onBlur'] as (() => void) | undefined,
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
  renderItem(info: { item: unknown; index: number; section: Section }): ReactNode;
  renderSectionHeader?(info: { section: Section }): ReactNode;
  renderSectionFooter?(info: { section: Section }): ReactNode;
  ListHeaderComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
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
        ...section.data.map((item, position) =>
          createElement(
            Fragment,
            { key: props.keyExtractor(item) },
            props.renderItem({ item, index: position, section }),
          ),
        ),
        props.renderSectionFooter?.({ section }) ?? null,
      ),
    ),
    props.ListFooterComponent ?? null,
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
  keyExtractor(item: unknown, index: number): string;
  renderItem(info: { item: unknown; index: number }): ReactNode;
  ListHeaderComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
  ListEmptyComponent?: ReactNode;
  ref?: unknown;
}) =>
  createElement(
    'div',
    { ref: props.ref },
    props.ListHeaderComponent ?? null,
    ...(props.data.length === 0
      ? [props.ListEmptyComponent ?? null]
      : props.data.map((item, index) =>
          createElement(
            Fragment,
            { key: props.keyExtractor(item, index) },
            props.renderItem({ item, index }),
          ),
        )),
    props.ListFooterComponent ?? null,
  );

export const StyleSheet = {
  flatten(style: unknown): object | undefined {
    if (Array.isArray(style))
      return Object.assign({}, ...style.map((item) => StyleSheet.flatten(item)));
    return style && typeof style === 'object' ? style : undefined;
  },
};
export const AccessibilityInfo = { announceForAccessibility: (_message: string) => {} };
