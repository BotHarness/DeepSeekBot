import { Platform, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useDesignTheme } from '../design/theme';
import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { profileShell, radius, space } from '../design/tokens';
import { ListSkeleton } from '../primitives/list-skeleton';
import { SwipePreview } from '../shell/swipe-preview';
import { useHeaderOverlap } from './native-header';
import { GroupMark } from './group-mark';
import { ProfileHero } from './profile-hero';

export function ProfileSwipePreview({
  travel,
  name,
  bot,
  groupAvatar,
}: {
  travel: SharedValue<number>;
  name: string;
  bot: RosterBot | undefined;
  groupAvatar: string | undefined;
}) {
  const theme = useDesignTheme();
  const headerOverlap = useHeaderOverlap();
  return (
    <SwipePreview travel={travel} color={theme.overlay.fill}>
      <View
        style={{
          paddingTop: (Platform.OS === 'ios' ? headerOverlap : 0) + space.x3,
        }}
      >
        <ProfileHero
          name={name}
          avatar={
            bot === undefined ? (
              <GroupMark avatar={groupAvatar} size={profileShell.avatar} corner={radius.round} />
            ) : (
              <BotAvatar bot={bot} size={profileShell.avatar} />
            )
          }
        />
        <ListSkeleton />
      </View>
    </SwipePreview>
  );
}
