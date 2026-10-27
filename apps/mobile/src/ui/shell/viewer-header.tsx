import type { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, View } from 'react-native';

import type { DesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { HeaderIconButton, type HeaderIcon as HeaderButtonIcon } from './header-icon-button';

type ScreenOptions = Exclude<ComponentProps<typeof Stack.Screen>['options'], Function | undefined>;
type HeaderItem = ReturnType<NonNullable<ScreenOptions['unstable_headerRightItems']>>[number];
type HeaderIcon = NonNullable<Extract<HeaderItem, { type: 'button' }>['icon']>;

export type ViewerHeaderAction = {
  key: string;
  label: string;
  symbol: HeaderIcon;
  icon: HeaderButtonIcon;
  onPress(): void;
};

export type ViewerHeader = {
  theme: DesignTheme;
  title: string;
  status: string;
  driving: boolean;
  closeLabel: string;
  onClose(): void;
  action?: ViewerHeaderAction | undefined;
};

function ViewerTitle({
  title,
  status,
  driving,
}: Pick<ViewerHeader, 'title' | 'status' | 'driving'>) {
  return (
    <View accessibilityRole="header" style={{ flexShrink: 1 }}>
      <Text testID="viewer-title" strong numberOfLines={1}>
        {title}
      </Text>
      <View accessibilityLiveRegion="polite">
        <Text variant="meta" tone={driving ? 'accent' : 'muted'} numberOfLines={1}>
          {status}
        </Text>
      </View>
    </View>
  );
}

export function viewerHeaderOptions({
  theme,
  title,
  status,
  driving,
  closeLabel,
  onClose,
  action,
}: ViewerHeader): ScreenOptions {
  const base: ScreenOptions = {
    headerShown: true,
    headerBackVisible: false,
    title,
    headerTintColor: theme.color.fg,
    headerTitle: () => <ViewerTitle title={title} status={status} driving={driving} />,
  };
  if (Platform.OS === 'ios')
    return {
      ...base,
      unstable_headerLeftItems: () => [
        {
          type: 'button',
          label: closeLabel,
          identifier: 'viewer-close',
          icon: { type: 'sfSymbol', name: 'xmark' },
          onPress: onClose,
        },
      ],
      unstable_headerRightItems: () =>
        action === undefined
          ? []
          : [
              {
                type: 'button',
                label: action.label,
                identifier: `viewer-${action.key}`,
                icon: action.symbol,
                onPress: action.onPress,
              },
            ],
    };
  return {
    ...base,
    headerLeft: () => (
      <HeaderIconButton icon="close" label={closeLabel} testID="viewer-close" onPress={onClose} />
    ),
    headerRight: () =>
      action === undefined ? null : (
        <HeaderIconButton
          icon={action.icon}
          label={action.label}
          testID={`viewer-${action.key}`}
          onPress={action.onPress}
        />
      ),
  };
}
