import Animated from 'react-native-reanimated';
import type { FlatList } from 'react-native';

export type ChatListHandle<T> = Pick<
  FlatList<T>,
  'scrollToOffset' | 'scrollToIndex' | 'getNativeScrollRef'
>;
export const nativeChatRecycler = false;
export const ChatList = Animated.FlatList;
