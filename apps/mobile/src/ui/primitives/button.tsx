import type { ActionSymbol } from '../../../../../packages/client/src/shared/action-presentation';
import {
  ArchiveIcon,
  CheckIcon,
  CloseIcon,
  PlusIcon,
  MessageIcon,
  SettingsIcon,
  FolderIcon,
  ShieldCheckIcon,
  ExternalLinkIcon,
  TerminalIcon,
  InfoIcon,
  RefreshIcon,
  PhotoIcon,
} from '../shell/icons';
import { Pressable, View } from 'react-native';
import { controlCase } from '../platform-copy';

import { buttonColors, type ButtonTone } from '../design/controls';
import type { LayerName } from '../design/layers';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from './text';
import { LoadingIndicator } from './loading-indicator';

export type { ButtonTone } from '../design/controls';

export type ButtonSymbol = ActionSymbol | 'photo';

export function Button({
  label,
  onPress,
  tone = 'secondary',
  disabled = false,
  busy = false,
  on = 'raised',
  variant = 'filled',
  symbol,
  testID,
}: {
  fit?: boolean;
  label: string;
  onPress(): void;
  tone?: ButtonTone;
  disabled?: boolean;
  busy?: boolean;
  on?: LayerName;
  variant?: 'filled' | 'text';
  symbol?: ButtonSymbol;
  testID?: string;
}) {
  const theme = useDesignTheme();
  const colors = buttonColors(theme, tone, on);
  const filled = variant === 'filled';
  const labelColor = filled
    ? colors.label
    : tone === 'danger'
      ? theme.color.danger
      : theme.color.fg;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      android_ripple={{ color: pressTint(labelColor) }}
      style={({ pressed }) => ({
        alignSelf: 'stretch',
        minHeight: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: space.x3,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        borderRadius: radius.round,
        backgroundColor: pressed ? colors.pressed : filled ? colors.fill : undefined,
        overflow: 'hidden',
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {busy ? (
        <LoadingIndicator size="control" color={labelColor} />
      ) : symbol ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {(() => {
            const Icon = {
              refresh: RefreshIcon,
              check: CheckIcon,
              'shield-check': ShieldCheckIcon,
              x: CloseIcon,
              archive: ArchiveIcon,
              plus: PlusIcon,
              'message-square': MessageIcon,
              settings: SettingsIcon,
              'folder-key': FolderIcon,
              'external-link': ExternalLinkIcon,
              terminal: TerminalIcon,
              info: InfoIcon,
              photo: PhotoIcon,
            }[symbol];
            return <Icon color={labelColor} size={theme.type.body.size} />;
          })()}
        </View>
      ) : null}
      <Text strong style={{ color: labelColor, textAlign: 'center', flexShrink: 1 }}>
        {controlCase(label)}
      </Text>
    </Pressable>
  );
}
