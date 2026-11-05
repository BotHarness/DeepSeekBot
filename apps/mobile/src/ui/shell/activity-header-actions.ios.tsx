import { Button, HStack, Host, Image, Menu } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityIdentifier,
  accessibilityLabel,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { controlCase } from '../platform-copy';
import { useStrings } from '../strings';

import type { ActivityHeaderActionsProps } from './activity-header-actions';

export function ActivityHeaderActions({
  filtered,
  searching,
  onFilter,
  onSearch,
  manage,
}: ActivityHeaderActionsProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = Number.parseInt(String(Platform.Version), 10) >= 26;
  const glyph = (
    name: 'ellipsis' | 'line.3.horizontal.decrease' | 'magnifyingglass',
    on: boolean,
  ) => (
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
        {manage ? (
          <Menu
            label={glyph('ellipsis', false)}
            modifiers={[
              buttonStyle('plain'),
              tint(theme.color.fg),
              accessibilityLabel(t.activityMore),
              accessibilityIdentifier('activity-more'),
            ]}
          >
            {manage.items.map((item) => (
              <Button
                key={item.key}
                label={controlCase(item.label)}
                systemImage={item.icon === 'read' ? 'checkmark.circle' : 'archivebox'}
                {...(item.destructive === true ? { role: 'destructive' as const } : {})}
                onPress={() => manage.run(item.key)}
              />
            ))}
          </Menu>
        ) : null}
        <Button
          onPress={onFilter}
          modifiers={[
            buttonStyle('plain'),
            accessibilityLabel(t.activityOptions),
            accessibilityAddTraits(filtered ? ['isSelected'] : []),
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
