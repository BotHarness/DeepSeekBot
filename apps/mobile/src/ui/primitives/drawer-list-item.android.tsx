import { Box, Host, ListItem, RNHostView, Row, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  clip,
  combinedClickable,
  fillMaxWidth,
  Shapes,
  size,
} from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import type { DrawerListItemProps } from './drawer-list-item';

export function DrawerListItem({
  label,
  detail,
  detailDot,
  singleLine = false,
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
  const lines = singleLine ? { maxLines: 1, overflow: 'ellipsis' as const } : {};
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
              <Text color={disabled ? theme.color.muted : theme.color.fg} {...lines}>
                {label}
              </Text>
            </ListItem.HeadlineContent>
            {detail && (
              <ListItem.SupportingContent>
                {detailDot === undefined ? (
                  <Text color={theme.color.muted} {...lines}>
                    {detail}
                  </Text>
                ) : (
                  <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: space.x3 }}>
                    <Box
                      modifiers={[
                        size(space.x3, space.x3),
                        clip(Shapes.Circle),
                        background(detailDot),
                      ]}
                    />
                    <Text color={theme.color.muted} {...lines}>
                      {detail}
                    </Text>
                  </Row>
                )}
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
