import { RegularTabPage } from '../../../src/features/pinned-tab/regular-tab-page';
import { useStrings } from '../../../src/ui/strings';

export default function PinnedRegularTabsActivityFixture() {
  const t = useStrings();
  return <RegularTabPage title={t.activity} slot="activity" />;
}
