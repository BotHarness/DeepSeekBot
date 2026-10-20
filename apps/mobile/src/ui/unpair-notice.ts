import { showAppDialog } from './primitives/app-dialog';
import { t } from './strings';

export function noticeHostKept(
  unpaired: { revoked: Promise<boolean> } | undefined,
  hostName: string,
): void {
  void unpaired?.revoked.then((revoked) => {
    if (!revoked)
      showAppDialog(t.unpairHostKept(hostName), t.unpairHostKeptDetail, [{ text: t.done }]);
  });
}
