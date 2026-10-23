import { router, usePathname } from 'expo-router';
import { View } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChannelCreation } from '../../host/native-channel-creation';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export function ChannelCreationNotice() {
  const t = useStrings();
  const state = useChannelCreation();
  const path = usePathname();
  const keyboardOpen = useKeyboardState((state) => state.isVisible);
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  if (
    !state.loaded ||
    state.record.kind !== 'submitted' ||
    path === '/create-channel' ||
    keyboardOpen
  )
    return null;
  return (
    <View
      testID="create-channel-notice"
      accessibilityLiveRegion="polite"
      style={{
        paddingHorizontal: space.x5,
        paddingBottom: insets.bottom + space.x2,
        paddingTop: space.x2,
      }}
    >
      <View
        style={{
          padding: space.x3,
          gap: space.x2,
          borderRadius: radius.lg,
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        {state.result ? <Text>{t.botCreation.completed}</Text> : null}
        <Button
          label={t.channelCreation.resume}
          testID="create-channel-resume"
          onPress={() => router.push('/create-channel')}
        />
      </View>
    </View>
  );
}
