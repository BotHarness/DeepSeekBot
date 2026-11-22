import { useHeaderStatus } from './use-header-status';
import { ChatTitleCapsule } from './chat-title-capsule';
import { ConnectionProgress } from '../primitives/connection-progress';
import { View } from 'react-native';

import type { RosterBot } from '@botharness/host-client/client';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { barLabelProps, headerContentScale, glassHeader } from './native-header';

const AVATAR = 28;

export function ChatTitle({
  bot,
  fallback,
  connectionLabel,
  onPress,
}: {
  bot: RosterBot | undefined;
  fallback: string;
  connectionLabel?: string | undefined;
  onPress(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const contentScale = glassHeader ? headerContentScale(theme) : 1;
  const avatarSize = AVATAR * contentScale;
  const headerStatus = useHeaderStatus(bot, undefined);
  const name = bot?.displayName ?? fallback;
  const status = (
    <Text
      {...barLabelProps}
      variant="meta"
      tone="muted"
      numberOfLines={1}
      style={{ flexShrink: 1 }}
    >
      {connectionLabel ?? headerStatus.label}
    </Text>
  );
  return (
    <ChatTitleCapsule
      title={name}
      subtitle={status}
      testID="bot-details-chip"
      accessibilityRole="button"
      accessibilityLabel={[name, headerStatus.label, connectionLabel].filter(Boolean).join(', ')}
      accessibilityState={{ busy: connectionLabel !== undefined }}
      accessibilityHint={t.openProfile}
      disabled={bot === undefined}
      onPress={onPress}
      leadingSize={avatarSize}
      leading={
        bot ? (
          <BotAvatar bot={bot} size={avatarSize} ring={false} />
        ) : (
          <View style={{ width: avatarSize, height: avatarSize }} />
        )
      }
      trailing={<ConnectionProgress active={connectionLabel !== undefined} />}
    />
  );
}
