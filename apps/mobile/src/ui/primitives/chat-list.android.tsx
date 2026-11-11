import {
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
  type ReactElement,
  type ComponentType,
} from 'react';
import {
  Keyboard,
  StyleSheet,
  View,
  type FlatListProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ViewProps,
  type ViewInstance,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ChatListHandle } from './chat-list';

export const nativeChatRecycler =
  process.env.EXPO_PUBLIC_CHAT_LIST === 'recycler' &&
  requireOptionalNativeModule<{ supported: boolean }>('ChatRecycler')?.supported === true;
type Event<T> = { nativeEvent: T };
type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;
type Handle = ViewInstance & {
  measureCell(key: string, height: number): Promise<void>;
  scrollToOffset(offset: number, animated: boolean): Promise<void>;
  scrollToIndex(index: number, position: number): Promise<void>;
};
type Props = ViewProps & {
  ref?: Ref<Handle>;
  rows: string[];
  following: boolean;
  estimate: number;
  textRows: object[];
  textStyle?: object | undefined;
  contentTop: number;
  contentBottom: number;
  onWindow(event: Event<{ start: number; end: number; width: number }>): void;
  onContentSize(event: Event<{ width: number; height: number }>): void;
  onVisible(event: Event<{ indices: number[] }>): void;
  onKeyboardInset(event: Event<{ height: number }>): void;
  onScroll?: ((event: ScrollEvent) => void) | undefined;
  onScrollBeginDrag?: ((event: ScrollEvent) => void) | undefined;
  onScrollEndDrag?: ((event: ScrollEvent) => void) | undefined;
  onMomentumScrollBegin?: ((event: ScrollEvent) => void) | undefined;
  onMomentumScrollEnd?: ((event: ScrollEvent) => void) | undefined;
};
const Native = nativeChatRecycler ? requireNativeView<Props>('ChatRecycler') : undefined;
const Cell = nativeChatRecycler
  ? requireNativeView<ViewProps & { rowKey: string }>('ChatRecyclerCell')
  : undefined;

function element(value: ComponentType | ReactElement | null | undefined) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'function') {
    const Component = value;
    return <Component />;
  }
  return value;
}

export type NativeRowProps<T> = {
  nativeRow?: ((item: T) => ({ key: string } & object) | undefined) | undefined;
  nativeStyle?: object | undefined;
};

function RecyclerList<T>({
  ref,
  nativeRow,
  nativeStyle,
  ...props
}: FlatListProps<T> & NativeRowProps<T> & { ref?: Ref<ChatListHandle<T>> }) {
  const native = useRef<Handle>(null);
  const [window, setWindow] = useState({ start: 0, end: 12, width: 0 });
  const data = props.data ?? [];
  const hasHeader = props.ListHeaderComponent !== undefined && props.ListHeaderComponent !== null;
  const keys = [
    ...(hasHeader ? ['$header'] : []),
    ...Array.from(data, (item, index) => `item:${props.keyExtractor?.(item, index) ?? index}`),
    ...(props.ListFooterComponent === undefined || props.ListFooterComponent === null
      ? []
      : ['$footer']),
  ];
  const offset = hasHeader ? 1 : 0;
  const textRows = useMemo(
    () =>
      nativeRow === undefined
        ? []
        : Array.from(data, (item) => nativeRow(item)).flatMap((row) =>
            row === undefined ? [] : [{ ...row, key: `item:${row.key}` }],
          ),
    [data, nativeRow],
  );
  const nativeKeys = useMemo(() => new Set(textRows.map((row) => row.key)), [textRows]);
  const style = StyleSheet.flatten(props.contentContainerStyle);
  const top = typeof style?.paddingTop === 'number' ? style.paddingTop : 0;
  const bottom = typeof style?.paddingBottom === 'number' ? style.paddingBottom : 0;
  const following = useRef(true);
  const endReached = useRef(-1);
  useImperativeHandle(
    ref,
    () => ({
      scrollToOffset({ offset, animated }) {
        void native.current?.scrollToOffset(offset, animated ?? false);
      },
      scrollToIndex({ index, viewPosition }) {
        following.current = false;
        void native.current?.scrollToIndex(index + offset, viewPosition ?? 0);
      },
      getNativeScrollRef: () => native.current as ScrollViewInstance | null,
    }),
    [offset],
  );
  if (Native === undefined || Cell === undefined) return null;
  return (
    <Native
      ref={native}
      rows={keys}
      following={following.current}
      estimate={96}
      textRows={textRows}
      textStyle={nativeStyle}
      contentTop={top}
      contentBottom={bottom}
      style={props.style}
      testID={props.testID}
      pointerEvents={props.pointerEvents}
      accessibilityElementsHidden={props.accessibilityElementsHidden}
      importantForAccessibility={props.importantForAccessibility}
      onLayout={props.onLayout}
      onWindow={({ nativeEvent }) =>
        setWindow((current) =>
          current.start === nativeEvent.start &&
          current.end === nativeEvent.end &&
          current.width === nativeEvent.width
            ? current
            : nativeEvent,
        )
      }
      onContentSize={({ nativeEvent }) =>
        props.onContentSizeChange?.(nativeEvent.width, nativeEvent.height)
      }
      onKeyboardInset={() => undefined}
      onStartShouldSetResponderCapture={() =>
        props.keyboardShouldPersistTaps === 'never' && Keyboard.isVisible()
      }
      onResponderRelease={() => Keyboard.dismiss()}
      onScroll={(event) => {
        following.current = event.nativeEvent.contentOffset.y <= 40;
        props.onScroll?.(event);
        const remaining =
          event.nativeEvent.contentSize.height -
          event.nativeEvent.layoutMeasurement.height -
          event.nativeEvent.contentOffset.y;
        if (
          remaining <
          event.nativeEvent.layoutMeasurement.height * (props.onEndReachedThreshold ?? 0.5)
        ) {
          if (endReached.current !== keys.length) {
            endReached.current = keys.length;
            props.onEndReached?.({ distanceFromEnd: remaining });
          }
        } else endReached.current = -1;
      }}
      onScrollBeginDrag={(event) => {
        following.current = false;
        if (props.keyboardDismissMode === 'on-drag') Keyboard.dismiss();
        props.onScrollBeginDrag?.(event);
      }}
      onScrollEndDrag={props.onScrollEndDrag}
      onMomentumScrollBegin={props.onMomentumScrollBegin}
      onMomentumScrollEnd={props.onMomentumScrollEnd}
      onVisible={({ nativeEvent }) => {
        const items = nativeEvent.indices.flatMap((position) => {
          const index = position - offset;
          const item = data[index];
          return item === undefined
            ? []
            : [
                {
                  item,
                  index,
                  key: props.keyExtractor?.(item, index) ?? String(index),
                  isViewable: true,
                },
              ];
        });
        props.onViewableItemsChanged?.({ viewableItems: items, changed: items });
      }}
    >
      {keys.slice(window.start, window.end).map((key, relative) => {
        if (nativeKeys.has(key)) return null;
        const index = window.start + relative - offset;
        const content =
          key === '$header'
            ? element(props.ListHeaderComponent)
            : key === '$footer'
              ? element(props.ListFooterComponent)
              : props.renderItem?.({
                  item: data[index]!,
                  index,
                  separators: { highlight() {}, unhighlight() {}, updateProps() {} },
                });
        return (
          <Cell key={key} rowKey={key} style={{ position: 'absolute', width: window.width }}>
            <View
              collapsable={false}
              onLayout={({ nativeEvent }) => {
                if (window.width > 0)
                  void native.current?.measureCell(key, nativeEvent.layout.height);
              }}
            >
              {content}
            </View>
          </Cell>
        );
      })}
    </Native>
  );
}

export const ChatList = nativeChatRecycler ? RecyclerList : Animated.FlatList;
