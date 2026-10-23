import { FilledTonalIconButton, Host, Icon } from '@expo/ui/jetpack-compose';
import { defaultMinSize, semantics, testID } from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';

import type { LocalVideoClientState } from '../../../../../packages/computer/src/local-video-client';
import { useHostLook } from '../../host/native-host-look';
import { shownHostName } from '../design/host-look';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { SystemSymbol } from '../primitives/system-symbol';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { computerHeaderState } from './computer-header-state';
import { headerGlassFill, titleChipFill } from './header-chrome';

export function ComputerVideoHeader({
  hostId,
  hostName,
  connected,
  state,
  onExit,
}: {
  hostId: string | undefined;
  hostName: string | undefined;
  connected: boolean;
  state: LocalVideoClientState;
  onExit(): void;
}) {
  const theme = useDesignTheme();
  const look = useHostLook(hostId);
  const name = shownHostName(look, hostName ?? t.computerEnvironment);
  const { signal, controller } = computerHeaderState(connected, state);
  const signalColor =
    signal === 'live'
      ? theme.color.success
      : signal === 'waiting'
        ? theme.color.warning
        : theme.color.subtle;
  const symbol = {
    human: { ios: 'person.fill', android: 'person' },
    bot: { ios: 'cpu', android: 'smart_toy' },
    paused: { ios: 'pause.circle', android: 'pause_circle' },
    unknown: { ios: 'questionmark.circle', android: 'help_outline' },
  } as const;
  return (
    <View
      style={{
        paddingHorizontal: space.x3,
        paddingVertical: space.x2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
      }}
    >
      <Host
        matchContents
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        ignoreSafeAreaKeyboardInsets
      >
        <FilledTonalIconButton
          onClick={onExit}
          colors={{
            containerColor: headerGlassFill(theme, false, false).backgroundColor,
            contentColor: theme.color.fg,
          }}
          modifiers={[
            testID('computer-video-close'),
            defaultMinSize({ minWidth: theme.touch, minHeight: theme.touch }),
            semantics({ contentDescription: t.computerVideoExit }),
          ]}
        >
          <Icon source={require('../../../assets/toolbar/back.png')} size={theme.type.title.line} />
        </FilledTonalIconButton>
      </Host>
      <View
        testID="computer-video-environment"
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${name}, ${t.computerVideoSignal[signal]}, ${t.computerVideoController[controller]}`}
        style={{
          flexShrink: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          minHeight: theme.touch,
          paddingVertical: space.x2,
          paddingHorizontal: space.x4,
          borderRadius: radius.round,
          ...titleChipFill(theme, false),
        }}
      >
        <SystemSymbol
          name={{ ios: 'desktopcomputer', android: 'computer' }}
          size={theme.type.body.line}
          color={theme.color.fg}
        />
        <Text strong numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
        </Text>
        <View
          style={{
            width: space.x3,
            height: space.x3,
            borderRadius: radius.round,
            backgroundColor: signalColor,
          }}
        />
        <SystemSymbol
          name={symbol[controller]}
          size={theme.type.body.line}
          color={theme.color.fg}
        />
      </View>
    </View>
  );
}
