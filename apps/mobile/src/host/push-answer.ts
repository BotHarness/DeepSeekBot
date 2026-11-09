import type { SavedHost } from './hosts';
import { parsePushData } from './push';
import { ANSWERED, APPROVAL_ACTIONS, decideFromPush, type PushDecision } from './push-actions';

export interface AnswerResponse {
  id: string;
  action: string;
  title: string | null;
  data: unknown;
}

export interface AnswerPort {
  claim(id: string): boolean;
  hosts(): Promise<readonly SavedHost[]>;
  decide: Parameters<typeof decideFromPush>[3];
  dismiss(id: string): Promise<void>;
  retry(title: string, data: Record<string, unknown>): Promise<void>;
}

export async function answerInPlace(
  response: AnswerResponse,
  port: AnswerPort,
): Promise<PushDecision | undefined> {
  if (APPROVAL_ACTIONS[response.action] === undefined) return undefined;
  const target = parsePushData(response.data);
  if (target === undefined || !port.claim(response.id)) return undefined;
  const result: PushDecision =
    (await decideFromPush(await port.hosts(), target, response.action, port.decide).catch(
      () => 'failed' as const,
    )) ?? 'failed';
  await port.dismiss(response.id).catch(() => undefined);
  if (ANSWERED.has(result)) return result;
  const { itemId: _itemId, ...open } = target;
  await port.retry(response.title ?? '', { v: 1, ...open }).catch(() => undefined);
  return result;
}
