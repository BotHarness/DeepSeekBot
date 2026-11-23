import { fab } from '../design/tokens';
import { useStrings } from '../strings';
import { NavigationAction } from './navigation-action';

export function SessionCreateFab({ onPress }: { onPress(): void }) {
  const t = useStrings().hostSessions;
  return (
    <NavigationAction
      label={t.create}
      size={fab.size}
      testID="session-create-fab"
      onPress={onPress}
    />
  );
}
