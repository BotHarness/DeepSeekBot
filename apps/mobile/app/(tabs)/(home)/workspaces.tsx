import { Stack, useIsFocused, useNavigation } from 'expo-router';
import { useSharedValue } from 'react-native-reanimated';

import { WorkspacePanel } from '../../../src/ui/shell/host-drawer';
import { ChatsSwipePreview } from '../../../src/ui/shell/last-chat-swipe';
import { swipeEntry } from '../../../src/ui/shell/swipe-entry';
import { SwipeOpen } from '../../../src/ui/shell/swipe-open';
import { CHATS_ROUTE } from '../../../src/ui/shell/workspace-panel-root';
import { useStrings } from '../../../src/ui/strings';

export default function WorkspacesScreen() {
  const t = useStrings();
  const focused = useIsFocused();
  const navigation = useNavigation();
  const travel = useSharedValue(0);
  return (
    <>
      <Stack.Screen options={{ title: t.workspaces }} />
      <SwipeOpen
        testID="workspace-panel-swipe"
        enabled={focused}
        travel={travel}
        onOpen={() =>
          navigation.dispatch({
            type: 'PUSH',
            payload: { name: CHATS_ROUTE, params: { entry: swipeEntry } },
          })
        }
      >
        <WorkspacePanel page active={focused} />
      </SwipeOpen>
      <ChatsSwipePreview travel={travel} />
    </>
  );
}
