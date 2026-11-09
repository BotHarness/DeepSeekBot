import { createHostClient } from './client';
import type { SavedHost } from './hosts';
import { nativeCarrier } from './native-carrier';
import { decideApproval, type ApprovalChoice, type RequestRef } from './requests';

export async function decideOverRoute(
  host: SavedHost,
  route: string,
  ref: RequestRef,
  outcome: ApprovalChoice,
) {
  const client = createHostClient({ ...host, routes: [route], carrier: nativeCarrier() });
  try {
    return await decideApproval(client, ref, outcome, 'notification');
  } finally {
    client.stop();
  }
}
