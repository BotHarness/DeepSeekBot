import { Button, HStack, Host, Image } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  glassEffect,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';

import type { ActivityHeaderActionsProps } from './activity-header-actions';

export function ActivityHeaderActions({
  filtered,
  searching,
  onFilter,
  onSearch,
}: ActivityHeaderActionsProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = Number.parseInt(String(Platform.Version), 10) >= 26;
  const glyph = (name: 'line.3.horizontal.decrease' | 'magnifyingglass', on: boolean) => (
    <Image
      systemName={name}
      modifiers={[
        font({ textStyle: 'body', weight: 'medium' }),
        foregroundStyle(on ? theme.color.accent : theme.color.fg),
        frame({ width: theme.touch, height: theme.touch }),
      ]}
    />
  );
  return (
    <Host key={theme.scheme} colorScheme={theme.scheme} matchContents>
      <HStack
        spacing={0}
        modifiers={[
          ...(glass
            ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' })]
            : []),
          frame({ height: theme.touch }),
        ]}
      >
        <Button
          onPress={onFilter}
          modifiers={[
            buttonStyle('plain'),
            accessibilityLabel(t.activityOptions),
            accessibilityIdentifier('activity-filter-button'),
          ]}
        >
          {glyph('line.3.horizontal.decrease', filtered)}
        </Button>
        <Button
          onPress={onSearch}
          modifiers={[
            buttonStyle('plain'),
            accessibilityLabel(t.activitySearch),
            accessibilityIdentifier('activity-search-button'),
          ]}
        >
          {glyph('magnifyingglass', searching)}
        </Button>
      </HStack>
    </Host>
  );
}
