import { Host, ListItem, RNHostView, Text } from '@expo/ui/jetpack-compose';
import { clip, combinedClickable, fillMaxWidth, Shapes } from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import type { DrawerListItemProps } from './drawer-list-item';

export function DrawerListItem({
  label,
  detail,
  accessibilityLabel,
  testID,
  selected = false,
  disabled = false,
  leading,
  trailing,
  onPress,
  onLongPress,
}: DrawerListItemProps) {
  const theme = useDesignTheme();
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [label, detail].filter(Boolean).join(', ')}
      accessibilityState={{ selected, disabled }}
      testID={testID}
      accessibilityActions={
        disabled ? [] : [{ name: 'activate' }, ...(onLongPress ? [{ name: 'longpress' }] : [])]
      }
      onAccessibilityAction={({ nativeEvent }) => {
        if (disabled) return;
        if (nativeEvent.actionName === 'activate') onPress();
        if (nativeEvent.actionName === 'longpress') onLongPress?.();
      }}
      style={{ minWidth: 0 }}
    >
      <View importantForAccessibility="no-hide-descendants">
        <Host
          matchContents={{ vertical: true }}
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
        >
          <ListItem
            colors={{ containerColor: selected ? theme.layer.sheet.chosen : theme.overlay.fill }}
            modifiers={[
              fillMaxWidth(),
              clip(Shapes.RoundedCorner(radius.lg)),
              ...(disabled
                ? []
                : [
                    combinedClickable({
                      onClick: onPress,
                      ...(onLongPress ? { onLongClick: onLongPress } : {}),
                    }),
                  ]),
            ]}
          >
            {leading && (
              <ListItem.LeadingContent>
                <RNHostView matchContents>
                  <View>{leading}</View>
                </RNHostView>
              </ListItem.LeadingContent>
            )}
            <ListItem.HeadlineContent>
              <Text color={disabled ? theme.color.muted : theme.color.fg}>{label}</Text>
            </ListItem.HeadlineContent>
            {detail && (
              <ListItem.SupportingContent>
                <Text color={theme.color.muted}>{detail}</Text>
              </ListItem.SupportingContent>
            )}
            {trailing && (
              <ListItem.TrailingContent>
                <RNHostView matchContents>
                  <View style={{ paddingLeft: space.x1 }}>{trailing}</View>
                </RNHostView>
              </ListItem.TrailingContent>
            )}
          </ListItem>
        </Host>
      </View>
    </View>
  );
}
