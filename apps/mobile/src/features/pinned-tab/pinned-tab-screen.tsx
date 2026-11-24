import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConversationPages } from '../../ui/chat/conversation-pages';
import { useDesignTheme } from '../../ui/design/theme';
import { space } from '../../ui/design/tokens';
import { Button } from '../../ui/primitives/button';
import { Text } from '../../ui/primitives/text';
import { StackRoot } from '../../ui/shell/stack-root';
import { TabIslandScreen } from '../../ui/shell/tab-island-screen';
import { useStrings } from '../../ui/strings';
import { usePinnedTabState } from './use-pinned-tab';

export function PinnedTabScreen() {
  const theme = useDesignTheme();
  const state = usePinnedTabState();
  if (state.kind === 'ready')
    return (
      <TabIslandScreen>
        <StackRoot value>
          <ConversationPages
            key={state.tab.key}
            expectedHostId={state.tab.hostId}
            place={state.tab.place}
            focus={undefined}
          />
        </StackRoot>
      </TabIslandScreen>
    );
  if (state.kind === 'loading')
    return (
      <View testID="pinned-tab-loading" style={{ flex: 1, backgroundColor: theme.color.base }} />
    );
  return <PinnedTabEmpty />;
}

function PinnedTabEmpty() {
  const t = useStrings().pinnedTab;
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="pinned-tab-empty"
      style={{
        flex: 1,
        backgroundColor: theme.color.base,
        paddingTop: insets.top + space.x6,
        paddingHorizontal: space.x5,
        gap: space.x4,
      }}
    >
      <Text variant="title" strong accessibilityRole="header">
        {t.emptyTitle}
      </Text>
      <Text tone="muted">{t.emptyBody}</Text>
      <Button
        testID="pinned-tab-add-computer"
        label={t.emptyAction}
        onPress={() => router.push('/environment')}
      />
    </View>
  );
}
