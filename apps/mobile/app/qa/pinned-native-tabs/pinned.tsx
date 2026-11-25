import { NativeTabPage } from '../../../src/features/pinned-tab/native-tab-page';
import { useStrings } from '../../../src/ui/strings';

export default function PinnedNativeTabsPinnedFixture() {
  const t = useStrings();
  return <NativeTabPage title={t.pinnedTabFixture.stewardName} avatar />;
}
