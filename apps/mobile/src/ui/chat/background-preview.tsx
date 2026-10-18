import { useMemo, useRef, type ReactNode } from 'react';
import { PanResponder, View } from 'react-native';
import type { BackgroundChoice } from '../../host/chat-background';
import { radius, space } from '../design/tokens';
import { t } from '../strings';
import { backgroundOverflow, dragBackground } from './background-position';
import { ChatBackground } from './chat-background';

export function BackgroundPreview({
  choice,
  imageUri,
  onChange,
  viewport,
  onViewport,
  children,
}: {
  choice: BackgroundChoice;
  imageUri(id: string): string;
  onChange: ((choice: BackgroundChoice) => void) | undefined;
  children: ReactNode;
  viewport: { width: number; height: number };
  onViewport(size: { width: number; height: number }): void;
}) {
  const overflow =
    choice.kind === 'image' ? backgroundOverflow(choice, viewport, choice.fit) : { x: 0, y: 0 };
  const current = useRef({ choice, overflow, onChange });
  current.current = { choice, overflow, onChange };
  const pan = useMemo(() => {
    let origin = { x: 0.5, y: 0.5 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        current.current.onChange !== undefined &&
        ((current.current.overflow.x >= 1 && Math.abs(gesture.dx) > space.x2) ||
          (current.current.overflow.y >= 1 && Math.abs(gesture.dy) > space.x2)),
      onPanResponderGrant: () => {
        if (current.current.choice.kind === 'image') origin = current.current.choice;
      },
      onPanResponderMove: (_, gesture) => {
        const { choice: image, overflow: crop, onChange: change } = current.current;
        if (image.kind === 'image')
          change?.({ ...image, ...dragBackground(origin, crop, { x: gesture.dx, y: gesture.dy }) });
      },
    });
  }, []);
  return (
    <View
      {...pan.panHandlers}
      onLayout={(event) => onViewport(event.nativeEvent.layout)}
      accessibilityLabel={t.hostLookPreview}
      style={{
        minHeight: space.x6 * 13,
        borderRadius: radius.lg,
        overflow: 'hidden',
        justifyContent: 'flex-end',
        padding: space.x5,
        gap: space.x4,
      }}
    >
      <ChatBackground choice={choice} imageUri={imageUri} />
      {children}
    </View>
  );
}
