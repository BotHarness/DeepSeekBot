import { useContext } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

import { ReplySwipeBlocker } from '../chat/reply-swipe-context';

export function HorizontalScroll(props: ScrollViewProps) {
  const Blocker = useContext(ReplySwipeBlocker);
  const view = <ScrollView horizontal {...props} />;
  return Blocker === undefined ? view : <Blocker>{view}</Blocker>;
}
