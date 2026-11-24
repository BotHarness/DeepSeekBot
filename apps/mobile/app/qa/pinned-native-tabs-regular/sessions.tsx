import { RegularTabPage } from '../../../src/features/pinned-tab/regular-tab-page';
import { useStrings } from '../../../src/ui/strings';

export default function PinnedRegularTabsSessionsFixture() {
  const t = useStrings();
  return <RegularTabPage title={t.hostSessions.title} slot="sessions" />;
}
