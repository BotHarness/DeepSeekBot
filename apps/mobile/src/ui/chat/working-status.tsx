import { View } from 'react-native';

import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { t } from '../strings';
import { stepLabel } from './bot-steps';

const AVATAR = 28;
export const MAX_WORKING_AVATARS = 3;

export function workingLabel(bots: readonly RosterBot[]): string {
  const [only] = bots;
  if (bots.length === 1 && only !== undefined) return stepLabel(only.activity, only.state);
  return t.state.working;
}

export function WorkingStatus({ bots }: { bots: readonly RosterBot[] }) {
  const theme = useDesignTheme();
  if (bots.length === 0) return null;
  const shown = bots.slice(0, MAX_WORKING_AVATARS);
  return (
    <View
      testID="working-status"
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={`${shown.map((bot) => bot.displayName).join(', ')}: ${workingLabel(bots)}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        flexShrink: 0,
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        {shown.map((bot, index) => (
          <View
            key={bot.slug}
            style={{
              marginLeft: index === 0 ? 0 : -space.x4,
              zIndex: shown.length - index,
              borderRadius: radius.round,
              borderWidth: shown.length === 1 ? 0 : edge.focus,
              borderColor: theme.color.base,
            }}
          >
            <BotAvatar bot={bot} size={AVATAR} ring={false} />
          </View>
        ))}
      </View>
    </View>
  );
}
