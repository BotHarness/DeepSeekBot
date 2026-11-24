import { RegularTabPage } from '../../../src/features/pinned-tab/regular-tab-page';
import { useStrings } from '../../../src/ui/strings';

export default function PinnedRegularTabsChatsFixture() {
  const t = useStrings();
  return <RegularTabPage title={t.chats} slot="index" />;
}
