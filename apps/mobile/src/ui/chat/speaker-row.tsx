import { createContext, useContext, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, {
  makeMutable,
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { groupSpan, speakerLift, type SpeakerRowLayout } from './speaker-span';

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
    if (value.value !== next) value.value = next;
  };
  return {
    span,
    setGroups(rows: ReadonlyArray<{ key: string; group: string }>): void {
      groups.clear();
      for (const row of rows) groups.set(row.group, [...(groups.get(row.group) ?? []), row.key]);
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
  viewport: AnimatedRef<View>;
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
}: {
  speaker: Speaker;
  rowKey: string;
  inset: number;
  style: ViewStyle;
  bubble: ReactNode;
  after?: ReactNode;
}) {
  const stage = useContext(SpeakerStageContext);
  const row = useAnimatedRef<View>();
  const surface = useAnimatedRef<View>();
  const laidOut = useSharedValue(0);
  const report = (patch: SpeakerRowLayout) => {
    laidOut.value += 1;
    stage?.registry.layout(rowKey, speaker.group, patch);
  };
  return (
    <Animated.View
      ref={row}
      style={style}
      onLayout={(event: LayoutChangeEvent) => report({ height: event.nativeEvent.layout.height })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 }}>
        <View style={{ width: SPEAKER_AVATAR, alignSelf: 'stretch' }}>
          {speaker.last ? (
            <StickyAvatar
              speaker={speaker}
              stage={stage}
              row={row}
              surface={surface}
              laidOut={laidOut}
            />
          ) : null}
        </View>
        <View style={{ flex: 1, gap: space.x1 }}>
          {speaker.first ? <AuthorName name={speaker.name} /> : null}
          <Animated.View
            ref={surface}
            collapsable={false}
            onLayout={(event: LayoutChangeEvent) =>
              report({ bubbleTop: inset + event.nativeEvent.layout.y })
            }
          >
            {bubble}
          </Animated.View>
          {after}
        </View>
      </View>
    </Animated.View>
  );
}

function StickyAvatar({
  speaker,
  stage,
  row,
  surface,
  laidOut,
}: {
  speaker: Speaker;
  stage: SpeakerStage | undefined;
  row: AnimatedRef<View>;
  surface: AnimatedRef<View>;
  laidOut: SharedValue<number>;
}) {
  const scroll = stage?.scroll;
  const viewport = stage?.viewport;
  const floor = stage?.floor ?? 0;
  const span = stage?.registry.span(speaker.group);
  const motion = useAnimatedStyle(() => {
    if (scroll === undefined || viewport === undefined || span === undefined)
      return { opacity: 1, transform: [{ translateY: 0 }] };
    const settled = Number.isFinite(scroll.value) && laidOut.value > 0;
    const rowFrame = measure(row);
    const bubbleFrame = measure(surface);
    const viewFrame = measure(viewport);
    if (rowFrame === null || bubbleFrame === null || viewFrame === null || !settled)
      return { opacity: 0, transform: [{ translateY: 0 }] };
    const bubbleBottom = bubbleFrame.pageY + bubbleFrame.height;
    const rest = bubbleBottom - rowFrame.pageY - SPEAKER_AVATAR;
    const lift = speakerLift({
      bubbleBottom,
      floor: viewFrame.pageY + viewFrame.height - floor,
      rest,
      span: span.value,
    });
    return { opacity: 1, transform: [{ translateY: rest - lift }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, motion]}>
      <SpeakerAvatar speaker={speaker} />
    </Animated.View>
  );
}

function SpeakerAvatar({ speaker }: { speaker: Speaker }) {
  const theme = useDesignTheme();
  if (speaker.bot !== undefined)
    return <BotAvatar bot={speaker.bot} size={SPEAKER_AVATAR} ring={false} />;
  return (
    <View
      style={{
        width: SPEAKER_AVATAR,
        height: SPEAKER_AVATAR,
        borderRadius: radius.round,
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

function AuthorName({ name }: { name: string }) {
  return (
    <Text variant="meta" tone="muted" strong numberOfLines={1}>
      {name}
    </Text>
  );
}
