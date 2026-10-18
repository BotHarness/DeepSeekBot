import { createElement, Fragment, type ReactNode } from 'react';

type Props = Record<string, unknown> & { children?: ReactNode };

const transition = { duration: () => transition };

const FlatList = (props: {
  data: Array<{ key: string }>;
  keyExtractor(row: unknown): string;
  renderItem(info: { item: unknown }): ReactNode;
  ListHeaderComponent?: ReactNode;
  ListEmptyComponent?: ReactNode;
}) =>
  createElement(
    'div',
    null,
    props.ListHeaderComponent ?? null,
    props.data.length === 0 ? (props.ListEmptyComponent ?? null) : null,
    ...props.data.map((row) =>
      createElement(Fragment, { key: props.keyExtractor(row) }, props.renderItem({ item: row })),
    ),
  );

const View = (props: Props) => createElement('div', null, props.children);

export default { FlatList, View, createAnimatedComponent: <T>(component: T) => component };
export const makeMutable = <T>(value: T) => ({ value });
export const measure = () => null;
export const useAnimatedRef = () => ({ current: null });
export const useAnimatedStyle = (worklet: () => object) => worklet();
export const useDerivedValue = <T>(worklet: () => T) => ({ value: worklet() });
export const useAnimatedReaction = () => {};
export const useAnimatedScrollHandler = (handlers: unknown) => handlers;
export const useScrollOffset = () => ({ value: 0 });
export const useSharedValue = <T>(value: T) => ({ value });
export const FadeOut = transition;
export const LinearTransition = transition;
export const useReducedMotion = () => false;
export const withTiming = <T>(value: T) => value;
export const interpolateColor = (_value: number, _range: number[], colors: string[]) =>
  colors.at(-1);
export const cancelAnimation = () => {};
export const ReduceMotion = { System: 'system' };
export const Easing = {
  linear: (t: number) => t,
  out: (curve: unknown) => curve,
  quad: (t: number) => t * t,
};
export class Keyframe {
  duration() {
    return this;
  }
}
