import { NativeTabPage } from '../../../src/features/pinned-tab/native-tab-page';
import { useStrings } from '../../../src/ui/strings';

export default function PinnedNativeTabsSettingsFixture() {
  const t = useStrings();
  return <NativeTabPage title={t.settings} />;
}
