import {
  AnimatedVisibility,
  Box,
  EnterTransition,
  ExitTransition,
  Text,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useState, type ComponentProps } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { useDesignTheme } from '../design/theme';
import { morphTitleSlots, type MorphTitleSlots } from './session-header-title';

export function MorphTitle({
  title,
  pending,
  style,
}: {
  title: string;
  pending: boolean;
  style: NonNullable<ComponentProps<typeof Text>['style']>;
}) {
  const theme = useDesignTheme();
  const reducedMotion = useReducedMotion();
  const [slots, setSlots] = useState<MorphTitleSlots>(() =>
    morphTitleSlots(undefined, title, pending),
  );
  const next = morphTitleSlots(slots, title, pending);
  if (next !== slots) setSlots(next);
  const text = (entry: { title: string; pending: boolean }) => (
    <Text
      style={style}
      {...(entry.pending ? { color: theme.color.muted } : {})}
      maxLines={1}
      overflow="ellipsis"
    >
      {entry.title}
    </Text>
  );
  if (reducedMotion) return text({ title, pending });
  return (
    <Box modifiers={[fillMaxWidth()]}>
      {next.entries.map((entry, index) => (
        <AnimatedVisibility
          key={index}
          visible={index === next.active}
          enterTransition={EnterTransition.fadeIn()}
          exitTransition={ExitTransition.fadeOut()}
        >
          {text(entry)}
        </AnimatedVisibility>
      ))}
    </Box>
  );
}
