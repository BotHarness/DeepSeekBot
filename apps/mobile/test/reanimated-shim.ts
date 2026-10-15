import { createElement, Fragment, type ReactNode } from 'react';

type Props = Record<string, unknown> & { children?: ReactNode };

const transition = { duration: () => transition };

const FlatList = (props: {
  data: Array<{ key: string }>;
  keyExtractor(row: unknown): string;
  renderItem(info: { item: unknown }): ReactNode;
  ListHeaderComponent?: ReactNode;
}) =>
  createElement(
    'div',
    null,
    props.ListHeaderComponent ?? null,
    ...props.data.map((row) =>
      createElement(Fragment, { key: props.keyExtractor(row) }, props.renderItem({ item: row })),
    ),
  );

const View = (props: Props) => createElement('div', null, props.children);

export default { FlatList, View };
export const makeMutable = <T>(value: T) => ({ value });
export const measure = () => null;
export const useAnimatedRef = () => ({ current: null });
export const useAnimatedStyle = (worklet: () => object) => worklet();
export const useScrollOffset = () => ({ value: 0 });
export const useSharedValue = <T>(value: T) => ({ value });
export const FadeOut = transition;
export const LinearTransition = transition;
