import { SessionDetailScreen } from '../../../../src/ui/chat/session-detail-screen';
import { TabIslandScreen } from '../../../../src/ui/shell/tab-island-screen';

export default function SessionScreen() {
  return (
    <TabIslandScreen>
      <SessionDetailScreen />
    </TabIslandScreen>
  );
}
