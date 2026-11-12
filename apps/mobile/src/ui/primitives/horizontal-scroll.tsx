import { useContext, useState } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

import { ReplySwipeBlocker } from '../chat/reply-swipe-context';

export function overflowsHorizontally(content: number, viewport: number): boolean {
  return viewport > 0 && content > viewport + 0.5;
}

export function HorizontalScroll(props: ScrollViewProps) {
  const Blocker = useContext(ReplySwipeBlocker);
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const view = (
    <ScrollView
      horizontal
      {...props}
      onLayout={(event) => {
        setViewport(event.nativeEvent.layout.width);
        props.onLayout?.(event);
      }}
      onContentSizeChange={(width, height) => {
        setContent(width);
        props.onContentSizeChange?.(width, height);
      }}
    />
  );
  return Blocker === undefined ? (
    view
  ) : (
    <Blocker blocking={overflowsHorizontally(content, viewport)}>{view}</Blocker>
  );
}
