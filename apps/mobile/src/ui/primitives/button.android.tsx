import type { ComponentProps } from 'react';
import {
  Button as FilledButton,
  CircularProgressIndicator,
  FilledTonalButton,
  Host,
  Icon,
  Row,
  Text,
  TextButton,
} from '@expo/ui/jetpack-compose';
import {
  defaultMinSize,
  fillMaxWidth,
  semantics,
  size,
  testID,
} from '@expo/ui/jetpack-compose/modifiers';
import { useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { loadingIndicator, materialButton } from '../design/tokens';
import { controlCase } from '../platform-copy';
import { useStrings } from '../strings';
import type { Button as SharedButton, ButtonSymbol } from './button';

export type { ButtonTone } from '../design/controls';
export type { ButtonSymbol } from './button';

const symbols: Record<ButtonSymbol, number> = {
  refresh: require('../../../assets/button/refresh.xml'),
  check: require('../../../assets/button/check.xml'),
  'shield-check': require('../../../assets/button/shield-check.xml'),
  x: require('../../../assets/button/x.xml'),
  archive: require('../../../assets/button/archive.xml'),
  plus: require('../../../assets/button/plus.xml'),
  'message-square': require('../../../assets/button/message-square.xml'),
  settings: require('../../../assets/button/settings.xml'),
  'folder-key': require('../../../assets/button/folder-key.xml'),
  'external-link': require('../../../assets/button/external-link.xml'),
  terminal: require('../../../assets/button/terminal.xml'),
  info: require('../../../assets/button/info.xml'),
  photo: require('../../../assets/button/photo.xml'),
};

export function Button({
  label,
  onPress,
  tone = 'secondary',
  disabled = false,
  busy = false,
  variant = 'filled',
  symbol,
  testID: id,
}: ComponentProps<typeof SharedButton>) {
  const t = useStrings();
  const theme = useDesignTheme();
  const roles = useMaterialRoles();
  const danger = tone === 'danger';
  const Control =
    variant === 'text'
      ? TextButton
      : tone === 'primary' || danger
        ? FilledButton
        : FilledTonalButton;
  const colors = !danger
    ? undefined
    : variant === 'text'
      ? { contentColor: roles.error }
      : { containerColor: roles.error, contentColor: roles.onError };
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      ignoreSafeAreaKeyboardInsets
      style={{ alignSelf: 'stretch' }}
    >
      <Control
        enabled={!disabled && !busy}
        onClick={onPress}
        {...(colors ? { colors } : {})}
        modifiers={[
          fillMaxWidth(),
          defaultMinSize({ minHeight: theme.touch }),
          ...(id ? [testID(id)] : []),
        ]}
      >
        <Row
          horizontalArrangement={{ spacedBy: materialButton.iconGap }}
          verticalAlignment="center"
        >
          {busy ? (
            <CircularProgressIndicator
              strokeWidth={loadingIndicator.controlStroke}
              strokeCap="round"
              modifiers={[
                size(materialButton.icon, materialButton.icon),
                semantics({ contentDescription: t.loading }),
              ]}
            />
          ) : symbol ? (
            <Icon source={symbols[symbol]} size={materialButton.icon} />
          ) : null}
          <Text style={{ textAlign: 'center' }}>{controlCase(label)}</Text>
        </Row>
      </Control>
    </Host>
  );
}
