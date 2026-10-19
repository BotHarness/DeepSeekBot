import { SourceName } from './source-name';
import { Pressable, View } from 'react-native';

import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { DrawerMaterial, useLiquidGlass } from '../primitives/drawer-material';
import { t } from '../strings';
import { botDotTone } from './bot-tone';
import { headerGlassFill } from './header-chrome';

const AVATAR = 28;
const DOT = space.x3;

export function ChatTitle({
  bot,
  fallback,
  onPress,
}: {
  bot: RosterBot | undefined;
  fallback: string;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const status = bot === undefined ? undefined : bot.paused ? t.paused : t.state[bot.state];
  const name = bot?.displayName ?? fallback;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={status === undefined ? name : `${name}, ${status}`}
      accessibilityHint={t.openProfile}
      disabled={bot === undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        minHeight: Math.max(theme.touch, theme.type.body.line * theme.fontScale + space.x3),
        paddingLeft: bot === undefined ? theme.touch / 2 : (theme.touch - AVATAR) / 2,
        paddingRight: bot === undefined ? theme.touch / 2 : (theme.touch - DOT) / 2,
        borderRadius: radius.round,
        ...headerGlassFill(theme, glass, pressed),
      })}
    >
      {glass ? <DrawerMaterial /> : null}
      {bot === undefined ? null : <BotAvatar bot={bot} size={AVATAR} ring={false} />}
      <SourceName name={name} source="computer" />
      {bot === undefined ? null : (
        <View
          testID="chat-title-state"
          style={{
            width: DOT,
            height: DOT,
            borderRadius: radius.round,
            backgroundColor: theme.color[botDotTone(bot)],
          }}
        />
      )}
    </Pressable>
  );
}
