import { NewSessionScreen } from '../../../src/features/sessions/new-session-screen';
import { SessionListScreen } from '../../../src/features/sessions/session-list-screen';
import { useSessionNavigationStyle } from '../../../src/ui/interface-preferences';
import { TabIslandScreen } from '../../../src/ui/shell/tab-island-screen';

export default function SessionsRoot() {
  const style = useSessionNavigationStyle();
  return (
    <TabIslandScreen>
      {style === 'stacked' ? <SessionListScreen /> : <NewSessionScreen />}
    </TabIslandScreen>
  );
}
