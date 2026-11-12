import {
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
  type ReactElement,
  type ReactNode,
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
import { requireNativeView } from 'expo';
import type { ChatListHandle, NativeRowAction, SpeakerRowSlot } from './chat-list';

export { nativeChatRecycler } from './chat-recycler';
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
  rowSwipe: boolean;
  speakerRows: object[];
  onRowAction(event: Event<{ key: string } & NativeRowAction>): void;
  onScroll?: ((event: ScrollEvent) => void) | undefined;
  onScrollBeginDrag?: ((event: ScrollEvent) => void) | undefined;
  onScrollEndDrag?: ((event: ScrollEvent) => void) | undefined;
  onMomentumScrollBegin?: ((event: ScrollEvent) => void) | undefined;
  onMomentumScrollEnd?: ((event: ScrollEvent) => void) | undefined;
};
const Native = requireNativeView<Props>('ChatRecycler');
const Cell = requireNativeView<ViewProps & { rowKey: string }>('ChatRecyclerCell');

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
  nativeSwipe?: boolean | undefined;
  onNativeRow?: ((item: T, event: NativeRowAction) => void) | undefined;
  speakerRow?: ((item: T) => SpeakerRowSlot | undefined) | undefined;
  speakerAvatar?: ((group: string) => ReactNode) | undefined;
};

function RecyclerList<T>({
  ref,
  nativeRow,
  nativeStyle,
  nativeSwipe = false,
  onNativeRow,
  speakerRow,
  speakerAvatar,
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
  const { textRows, nativeItems } = useMemo(() => {
    const rows: Array<{ key: string } & object> = [];
    const items = new Map<string, T>();
    if (nativeRow !== undefined)
      for (const item of Array.from(data)) {
        const row = nativeRow(item);
        if (row === undefined) continue;
        const key = `item:${row.key}`;
        rows.push({ ...row, key });
        items.set(key, item);
      }
    return { textRows: rows, nativeItems: items };
  }, [data, nativeRow]);
  const speakerRows = useMemo(() => {
    const rows: SpeakerRowSlot[] = [];
    if (speakerRow !== undefined)
      for (const item of Array.from(data)) {
        const row = speakerRow(item);
        if (row !== undefined) rows.push({ ...row, key: `item:${row.key}` });
      }
    return rows;
  }, [data, speakerRow]);
  const groupOf = useMemo(
    () => new Map(speakerRows.map((row) => [row.key, row.group])),
    [speakerRows],
  );
  const shownGroups =
    speakerAvatar === undefined
      ? []
      : [
          ...new Set(
            keys.slice(window.start, window.end).flatMap((key) => {
              const group = groupOf.get(key);
              return group === undefined ? [] : [group];
            }),
          ),
        ];
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
      rowSwipe={nativeSwipe}
      speakerRows={speakerRows}
      onRowAction={({ nativeEvent: { key, ...event } }) => {
        const item = nativeItems.get(key);
        if (item === undefined) return;
        if (
          (event.action === 'press' || event.action === 'hold') &&
          props.keyboardShouldPersistTaps === 'never' &&
          Keyboard.isVisible()
        )
          return;
        onNativeRow?.(item, event);
      }}
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
        if (nativeItems.has(key)) return null;
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
      {shownGroups.map((group) => (
        <Cell
          key={`avatar:${group}`}
          rowKey={`avatar:${group}`}
          style={{ position: 'absolute', top: 0, left: 0 }}
          pointerEvents="box-none"
        >
          {speakerAvatar?.(group)}
        </Cell>
      ))}
    </Native>
  );
}

export const ChatList = RecyclerList;
