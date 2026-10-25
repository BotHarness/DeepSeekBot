import { Host } from '@expo/ui';
import { HStack, Image, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, font, frame, lineLimit } from '@expo/ui/swift-ui/modifiers';
import { useWindowDimensions } from 'react-native';
import type { DesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useStrings } from '../strings';
import type { computerVideoStatus } from './computer-video-status';

export function ComputerVideoHeader({
  name,
  status,
  theme,
}: {
  name: string;
  status: ReturnType<typeof computerVideoStatus>;
  theme: DesignTheme;
}) {
  const t = useStrings();
  const { width } = useWindowDimensions();
  const connectionLabel =
    status.connection === 'live'
      ? t.computerVideoConnected
      : status.connection === 'waiting'
        ? t.computerVideoConnecting
        : t.computerVideoDisconnected;
  const controlLabel =
    status.control === 'human'
      ? t.computerYouDriving
      : status.control === 'other-human'
        ? t.computerVideoOtherHuman
        : status.control === 'bot'
          ? t.computerVideoBotsAvailable
          : status.control === 'paused'
            ? t.computerVideoBotsPaused
            : t.computerVideoControlUnknown;
  return (
    <Host
      colorScheme="dark"
      style={{ width: width - theme.touch * 2 - space.x6 * 2, height: theme.touch }}
    >
      <HStack spacing={space.x3} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
        <Image
          systemName={
            status.connection === 'disconnected' ? 'exclamationmark.circle.fill' : 'circle.fill'
          }
          size={space.x3}
          color={
            status.connection === 'live'
              ? theme.color.success
              : status.connection === 'waiting'
                ? theme.color.warning
                : theme.color.danger
          }
          modifiers={[accessibilityLabel(connectionLabel)]}
        />
        <Text
          testID="computer-video-environment"
          modifiers={[font({ textStyle: 'headline' }), lineLimit(1), accessibilityLabel(name)]}
        >
          {name}
        </Text>
        <Image
          systemName={
            status.control === 'human' || status.control === 'other-human'
              ? 'hand.raised.fill'
              : status.control === 'bot'
                ? 'cpu'
                : status.control === 'paused'
                  ? 'pause.circle.fill'
                  : 'questionmark.circle'
          }
          size={theme.type.title.line}
          color={theme.color.fg}
          modifiers={[accessibilityLabel(controlLabel)]}
        />
      </HStack>
    </Host>
  );
}
