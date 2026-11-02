import { createContext, useCallback, useContext, useState } from 'react';
import { AccessibilityInfo, type LayoutChangeEvent, type ViewInstance } from 'react-native';
import {
  measure,
  useAnimatedReaction,
  useAnimatedRef,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useMounted } from './mounted';
import type { MarkdownViewport } from './markdown-window';

export type MarkdownViewportStage = {
  viewport: AnimatedRef<ViewInstance>;
  content: AnimatedRef<ViewInstance>;
  scroll: SharedValue<number>;
  layout: SharedValue<number>;
  active: boolean;
};

export const MarkdownViewportContext = createContext<MarkdownViewportStage | undefined>(undefined);

export function useMarkdownViewport() {
  const stage = useContext(MarkdownViewportContext);
  const root = useAnimatedRef<ViewInstance>();
  const revision = useSharedValue(0);
  const sent = useSharedValue<MarkdownViewport>({ top: 0, height: 0 });
  const [visible, setVisible] = useState<MarkdownViewport>();
  const [width, setWidth] = useState(0);
  const [reader, setReader] = useState(true);
  const enabled = stage !== undefined;
  const readerMount = useMounted<ViewInstance>(() => {
    if (!enabled) return;
    let live = true;
    const report = (next: boolean) => {
      if (live) setReader(next);
    };
    void AccessibilityInfo.isScreenReaderEnabled()
      .then(report)
      .catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('screenReaderChanged', report);
    return () => {
      live = false;
      listener.remove();
    };
  }, [enabled]);
  const ref = useCallback(
    (node: ViewInstance | null) => {
      root(node);
      readerMount(node);
    },
    [root, readerMount],
  );
  const scroll = stage?.scroll;
  const viewport = stage?.viewport;
  const content = stage?.content;
  const layout = stage?.layout;
  const active = stage?.active === true;
  useAnimatedReaction(
    () => {
      if (
        !active ||
        viewport === undefined ||
        content === undefined ||
        scroll === undefined ||
        layout === undefined
      )
        return null;
      if (!Number.isFinite(scroll.value) || layout.value <= 0 || revision.value <= 0) return null;
      const document = measure(root);
      const frame = measure(viewport);
      const contentFrame = measure(content);
      if (document === null || frame === null || contentFrame === null || frame.height <= 0)
        return null;
      return {
        top: contentFrame.pageY - document.pageY + scroll.value,
        height: frame.height,
      };
    },
    (next) => {
      if (next === null) return;
      const previous = sent.value;
      if (
        previous.height === 0 ||
        Math.abs(next.height - previous.height) >= Math.max(next.height, previous.height) / 8 ||
        Math.abs(next.top - previous.top) >= next.height / 2
      ) {
        sent.value = next;
        scheduleOnRN(setVisible, next);
      }
    },
  );
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      setWidth(width);
      revision.value += 1;
    },
    [revision],
  );
  return {
    enabled,
    ref,
    onLayout,
    width,
    visible: enabled && !reader ? visible : undefined,
  };
}
