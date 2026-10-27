import { Stack, useIsFocused } from 'expo-router';

import { WorkspacePanel } from '../../../src/ui/shell/host-drawer';
import { useStrings } from '../../../src/ui/strings';

export default function WorkspacesScreen() {
  const t = useStrings();
  const focused = useIsFocused();
  return (
    <>
      <Stack.Screen options={{ title: t.workspaces }} />
      <WorkspacePanel page active={focused} />
    </>
  );
}
