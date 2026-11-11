import Animated from 'react-native-reanimated';
import type { FlatList } from 'react-native';

export type ChatListHandle<T> = Pick<
  FlatList<T>,
  'scrollToOffset' | 'scrollToIndex' | 'getNativeScrollRef'
>;
export type NativeRowAction = {
  action: 'press' | 'hold' | 'arm' | 'reply';
  anchor?: { x: number; y: number; width: number; height: number };
};
export { nativeChatRecycler } from './chat-recycler';
export const ChatList = Animated.FlatList;
