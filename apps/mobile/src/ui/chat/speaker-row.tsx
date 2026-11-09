import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle, type ViewInstance } from 'react-native';
import Animated, {
  makeMutable,
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { spring } from '../design/motion';
import { popScale, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Text } from '../primitives/text';
import { AVATAR_CORNER } from './bubble-shape';
import { usePopIn } from './pop-in';
import { SPEAKER_VIEWPORT, SpeakerAnchor } from './speaker-anchor';
import { groupSpan, speakerContentTop, speakerLift, type SpeakerRowLayout } from './speaker-span';

export type Speaker = {
  name: string;
  bot: RosterBot | undefined;
  group: string;
  first: boolean;
  last: boolean;
};

export const SPEAKER_AVATAR = 32;

export type SpeakerRegistry = ReturnType<typeof createSpeakerRegistry>;

export function createSpeakerRegistry() {
  const layouts = new Map<string, SpeakerRowLayout>();
  const groups = new Map<string, string[]>();
  const spans = new Map<string, SharedValue<number>>();
  const listeners = new Map<string, Set<() => void>>();
  const span = (group: string): SharedValue<number> => {
    const known = spans.get(group);
    if (known !== undefined) return known;
    const created = makeMutable(0);
    spans.set(group, created);
    return created;
  };
  const refresh = (group: string): void => {
    const next = groupSpan(groups.get(group) ?? [], layouts);
    const value = span(group);
    if (value.value === next) return;
    value.value = next;
    for (const listener of listeners.get(group) ?? []) listener();
  };
  return {
    span,
    spanOf(group: string): number {
      return spans.get(group)?.value ?? 0;
    },
    subscribe(group: string, listener: () => void): () => void {
      const known = listeners.get(group);
      if (known === undefined) listeners.set(group, new Set([listener]));
      else known.add(listener);
      return () => {
        const current = listeners.get(group);
        current?.delete(listener);
        if (current?.size === 0) listeners.delete(group);
      };
    },
    setGroups(rows: ReadonlyArray<{ key: string; group: string }>): void {
      groups.clear();
      const live = new Set<string>();
      for (const row of rows) {
        live.add(row.key);
        const keys = groups.get(row.group);
        if (keys === undefined) groups.set(row.group, [row.key]);
        else keys.push(row.key);
      }
      for (const key of layouts.keys()) if (!live.has(key)) layouts.delete(key);
      for (const group of spans.keys()) if (!groups.has(group)) spans.delete(group);
      for (const group of groups.keys()) refresh(group);
    },
    layout(key: string, group: string, patch: SpeakerRowLayout): void {
      layouts.set(key, { ...layouts.get(key), ...patch });
      if (!groups.has(group)) groups.set(group, [key]);
      refresh(group);
    },
  };
}

export type SpeakerStage = {
  registry: SpeakerRegistry;
  scroll: SharedValue<number>;
  viewport: AnimatedRef<ViewInstance>;
  viewportLayout: SharedValue<number>;
  frame: AnimatedRef<ViewInstance>;
  content: AnimatedRef<ViewInstance>;
  inverted: boolean;
  floor: number;
};

export const SpeakerStageContext = createContext<SpeakerStage | undefined>(undefined);

export function SpeakerRow({
  speaker,
  rowKey,
  inset,
  style,
  bubble,
  after,
  entering = false,
}: {
  speaker: Speaker;
  rowKey: string;
  inset: number;
  style: ViewStyle;
  bubble: ReactNode;
  after?: ReactNode;
  entering?: boolean;
}) {
  const stage = useContext(SpeakerStageContext);
  const row = useAnimatedRef<ViewInstance>();
  const surface = useAnimatedRef<ViewInstance>();
  const laidOut = useSharedValue(0);
  const [bottom, setBottom] = useState(0);
  const report = (patch: SpeakerRowLayout) => {
    laidOut.value += 1;
    stage?.registry.layout(rowKey, speaker.group, patch);
  };
  return (
    <View
      style={style}
      onLayout={(event: LayoutChangeEvent) => report({ height: event.nativeEvent.layout.height })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 }}>
        <Animated.View ref={row} style={{ width: SPEAKER_AVATAR, alignSelf: 'stretch' }}>
          {speaker.last ? (
            <StickyAvatar
              speaker={speaker}
              stage={stage}
              bottom={bottom}
              row={row}
              surface={surface}
              laidOut={laidOut}
              inset={inset}
              entering={entering}
            />
          ) : null}
        </Animated.View>
        <View style={{ flex: 1, gap: space.x1 }}>
          {speaker.first ? <AuthorName name={speaker.name} entering={entering} /> : null}
          <Animated.View
            ref={surface}
            collapsable={false}
            onLayout={(event: LayoutChangeEvent) => {
              const { y, height } = event.nativeEvent.layout;
              if (speaker.last && SpeakerAnchor !== undefined) setBottom(y + height);
              report({ bubbleTop: inset + y });
            }}
          >
            {bubble}
          </Animated.View>
          {after}
        </View>
      </View>
    </View>
  );
}

function StickyAvatar(props: {
  speaker: Speaker;
  stage: SpeakerStage | undefined;
  bottom: number;
  row: AnimatedRef<ViewInstance>;
  surface: AnimatedRef<ViewInstance>;
  laidOut: SharedValue<number>;
  inset: number;
  entering: boolean;
}) {
  if (SpeakerAnchor !== undefined && props.stage !== undefined)
    return <NativeStickyAvatar {...props} stage={props.stage} />;
  return <AnimatedStickyAvatar {...props} />;
}

function NativeStickyAvatar({
  speaker,
  stage,
  bottom,
  inset,
  entering,
}: {
  speaker: Speaker;
  stage: SpeakerStage;
  bottom: number;
  inset: number;
  entering: boolean;
}) {
  const reduced = useReducedMotion();
  const follows = entering && !speaker.first && !reduced;
  const follow = useSharedValue(follows ? 1 : 0);
  const glide = useMounted<ViewInstance>(() => {
    if (follow.get() > 0) follow.set(withSpring(0, spring.spatial.fast));
  }, []);
  const pop = usePopIn(entering && speaker.first, { from: popScale.badge });
  const { registry } = stage;
  const group = speaker.group;
  const span = useSyncExternalStore(
    (listener) => registry.subscribe(group, listener),
    () => registry.spanOf(group),
  );
  const rest = bottom - SPEAKER_AVATAR;
  const distance = bottom + inset;
  const trail = useAnimatedStyle(() => ({
    transform: [{ translateY: -follow.get() * distance }],
  }));
  if (SpeakerAnchor === undefined) return null;
  return (
    <SpeakerAnchor
      rest={rest}
      span={span + inset}
      floor={stage.floor}
      viewport={SPEAKER_VIEWPORT}
      style={{ position: 'absolute', top: 0, left: 0, opacity: bottom > 0 ? 1 : 0 }}
    >
      <Animated.View style={trail}>
        <Animated.View style={[{ transformOrigin: 'center bottom' }, pop.style]}>
          <View ref={pop.ref}>
            <View ref={glide}>
              <SpeakerAvatar speaker={speaker} />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </SpeakerAnchor>
  );
}

function AnimatedStickyAvatar({
  speaker,
  stage,
  row,
  surface,
  laidOut,
  inset,
  entering,
}: {
  speaker: Speaker;
  stage: SpeakerStage | undefined;
  row: AnimatedRef<ViewInstance>;
  surface: AnimatedRef<ViewInstance>;
  laidOut: SharedValue<number>;
  inset: number;
  entering: boolean;
}) {
  const reduced = useReducedMotion();
  const follows = entering && !speaker.first && !reduced;
  const follow = useSharedValue(follows ? 1 : 0);
  const glide = useMounted<ViewInstance>(() => {
    if (follow.get() > 0) follow.set(withSpring(0, spring.spatial.fast));
  }, []);
  const pop = usePopIn(entering && speaker.first, { from: popScale.badge });
  const scroll = stage?.scroll;
  const viewport = stage?.viewport;
  const viewportLayout = stage?.viewportLayout;
  const frame = stage?.frame;
  const content = stage?.content;
  const inverted = stage?.inverted === true;
  const floor = stage?.floor ?? 0;
  const span = stage?.registry.span(speaker.group);
  const place = useAnimatedStyle(() => {
    if (
      scroll === undefined ||
      viewport === undefined ||
      frame === undefined ||
      content === undefined ||
      span === undefined
    )
      return { opacity: 1, transform: [{ translateY: 0 }] };
    const offset = scroll.value;
    const settled =
      Number.isFinite(offset) && laidOut.value > 0 && (viewportLayout?.value ?? 1) > 0;
    const rowFrame = measure(row);
    const bubbleFrame = measure(surface);
    const contentFrame = measure(content);
    const listFrame = measure(frame);
    const viewFrame = measure(viewport);
    if (
      rowFrame === null ||
      bubbleFrame === null ||
      contentFrame === null ||
      listFrame === null ||
      viewFrame === null ||
      !settled
    )
      return { opacity: 0, transform: [{ translateY: 0 }] };
    const bubbleBottom =
      speakerContentTop({
        top: listFrame.pageY,
        height: listFrame.height,
        content: contentFrame.height,
        offset,
        inverted,
      }) +
      bubbleFrame.pageY +
      bubbleFrame.height -
      contentFrame.pageY;
    const rest = bubbleFrame.pageY + bubbleFrame.height - rowFrame.pageY - SPEAKER_AVATAR;
    const lift = speakerLift({
      bubbleBottom,
      floor: viewFrame.pageY + viewFrame.height - floor,
      rest,
      span: span.value + inset,
    });
    const distance = rest + SPEAKER_AVATAR + inset;
    return { opacity: 1, transform: [{ translateY: rest - lift - follow.get() * distance }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, place]}>
      <Animated.View style={[{ transformOrigin: 'center bottom' }, pop.style]}>
        <View ref={pop.ref}>
          <View ref={glide}>
            <SpeakerAvatar speaker={speaker} />
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function SpeakerAvatar({ speaker }: { speaker: Speaker }) {
  const theme = useDesignTheme();
  if (speaker.bot !== undefined)
    return (
      <BotAvatar bot={speaker.bot} size={SPEAKER_AVATAR} ring={false} corner={AVATAR_CORNER} />
    );
  return (
    <View
      style={{
        width: SPEAKER_AVATAR,
        height: SPEAKER_AVATAR,
        borderRadius: AVATAR_CORNER,
        backgroundColor: theme.color.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text strong tone="muted">
        {Array.from(speaker.name)[0] ?? ''}
      </Text>
    </View>
  );
}

function AuthorName({ name, entering }: { name: string; entering: boolean }) {
  const pop = usePopIn(entering, { from: 1 });
  return (
    <Animated.View style={pop.style}>
      <View ref={pop.ref}>
        <Text variant="meta" tone="muted" strong numberOfLines={1}>
          {name}
        </Text>
      </View>
    </Animated.View>
  );
}
