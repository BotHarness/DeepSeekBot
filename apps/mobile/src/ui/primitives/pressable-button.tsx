import type { ActionSymbol } from '../../../../../packages/client/src/shared/action-presentation';
import {
  ArchiveIcon,
  TrashIcon,
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

import { buttonColors, cardChoiceColors, type ButtonTone } from '../design/controls';
import type { LayerName } from '../design/layers';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useStrings } from '../strings';
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
  selected = false,
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
  selected?: boolean;
  on?: LayerName;
  variant?: 'filled' | 'text' | 'card-solid';
  symbol?: ButtonSymbol;
  testID?: string;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  const colors = buttonColors(theme, tone, on);
  const filled = variant === 'filled';
  const solid = variant === 'card-solid';
  const unavailable = disabled || busy;
  const state = unavailable ? (selected ? 'selected-disabled' : 'disabled') : 'rest';
  const choice = solid ? cardChoiceColors(theme, tone, state) : undefined;
  const pressedChoice = solid ? cardChoiceColors(theme, tone, 'pressed') : undefined;
  const labelColor =
    choice?.ink ??
    (filled ? colors.label : tone === 'danger' ? theme.color.danger : theme.color.fg);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy, selected }}
      disabled={disabled || busy}
      onPress={onPress}
      {...(solid ? {} : { android_ripple: { color: pressTint(labelColor) } })}
      style={({ pressed }) => {
        const paint = pressed && !unavailable ? pressedChoice : choice;
        return {
          alignSelf: 'stretch',
          minHeight: theme.touch,
          ...(solid ? { minWidth: theme.touch } : {}),
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.x3,
          paddingHorizontal: space.x5,
          paddingVertical: space.x3,
          borderRadius: radius.round,
          backgroundColor:
            paint?.fill ?? (pressed ? colors.pressed : filled ? colors.fill : undefined),
          overflow: 'hidden',
          opacity: !solid && disabled && !selected ? 0.45 : 1,
        };
      }}
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
              trash: TrashIcon,
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
        {controlCase(solid && selected ? `${label} · ${t.selectedChoice}` : label)}
      </Text>
    </Pressable>
  );
}
