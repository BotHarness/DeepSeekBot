import type { GroupGoneReason } from '../../host/channel-access';
import type { useStrings } from '../strings';

export type GroupUnavailableProps = { onBack(): void; reason: GroupGoneReason | undefined };

export function groupUnavailableCopy(t: ReturnType<typeof useStrings>, reason: GroupGoneReason) {
  return reason === 'removed'
    ? { title: t.groupAccessRemovedTitle, body: t.groupAccessRemovedBody }
    : { title: t.groupUnavailableTitle, body: t.groupUnavailableBody };
}
