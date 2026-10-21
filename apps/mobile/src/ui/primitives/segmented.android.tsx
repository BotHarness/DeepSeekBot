import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { pressTint, useDesignTheme } from '../design/theme';
import { androidSettings, space } from '../design/tokens';
import { RadioMark } from './radio-mark';
import { segmentCorners } from '../design/segment-corners';
import type { SegmentedProps } from './segmented';
import { Text } from './text';

const LABEL_SIZE = 14;
const SEGMENT_PADDING = 24;
const CHECK_WIDTH = 26;

function labelWidth(text: string, fontScale: number): number {
  let ems = 0;
  for (const char of text) ems += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.5;
  return ems * LABEL_SIZE * fontScale;
}

export function segmentsFit(labels: readonly string[], width: number, fontScale: number): boolean {
  const widest = Math.max(0, ...labels.map((text) => labelWidth(text, fontScale)));
  return labels.length * (widest + SEGMENT_PADDING) + CHECK_WIDTH <= width - space.x5 * 2;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  on = 'canvas',
  onChange,
}: SegmentedProps<T>) {
  const theme = useDesignTheme();
  const layer = theme.layer[on];
  const { width, fontScale } = useWindowDimensions();
  if (
    !segmentsFit(
      options.map((option) => option.label),
      width,
      fontScale,
    )
  )
    return (
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ gap: androidSettings.segmentGap }}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
              onPress={() => {
                if (!selected) onChange(option.value);
              }}
              android_ripple={{ color: pressTint(theme.color.fg) }}
              style={{
                minHeight: theme.touch,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x4,
                paddingHorizontal: space.x5,
                paddingVertical: space.x3,
                overflow: 'hidden',
                ...segmentCorners(index === 0, index === options.length - 1),
                backgroundColor: selected ? layer.chosen : layer.fill,
              }}
            >
              <RadioMark selected={selected} />
              <Text style={{ flex: 1 }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Host
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        matchContents={{ vertical: true }}
        style={{ width: '100%' }}
      >
        <SingleChoiceSegmentedButtonRow
          key={options.map((option) => option.value).join('\n')}
          modifiers={[fillMaxWidth()]}
        >
          {options.map((option) => (
            <SegmentedButton
              key={option.value}
              selected={option.value === value}
              onClick={() => {
                if (option.value !== value) onChange(option.value);
              }}
              colors={{
                activeContainerColor: layer.chosen,
                activeContentColor: theme.color.fg,
                activeBorderColor: theme.color.muted,
                inactiveContainerColor: 'transparent',
                inactiveContentColor: theme.color.fg,
                inactiveBorderColor: theme.color.muted,
              }}
            >
              <SegmentedButton.Label>
                <ComposeText maxLines={1} softWrap={false}>
                  {option.label}
                </ComposeText>
              </SegmentedButton.Label>
            </SegmentedButton>
          ))}
        </SingleChoiceSegmentedButtonRow>
      </Host>
    </View>
  );
}
