import { NewSessionScreen } from '../../../src/features/sessions/new-session-screen';
import { TabIslandScreen } from '../../../src/ui/shell/tab-island-screen';

export default function StackedNewSession() {
  return (
    <TabIslandScreen>
      <NewSessionScreen stacked />
    </TabIslandScreen>
  );
}
