import { NativeTabPage } from '../../../src/features/pinned-tab/native-tab-page';
import { useStrings } from '../../../src/ui/strings';

export default function PinnedNativeTabsSessionsFixture() {
  const t = useStrings();
  return <NativeTabPage title={t.hostSessions.title} />;
}
