import { RegularTabPage } from '../../../src/features/pinned-tab/regular-tab-page';
import { useFixtureTabOrder } from '../../../src/features/pinned-tab/tab-order';

export default function PinnedRegularTabsPinnedFixture() {
  const { target } = useFixtureTabOrder();
  return <RegularTabPage title={target?.name ?? ''} target={target} slot="pinned" />;
}
