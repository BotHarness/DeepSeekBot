import {
  COMPUTER_UNLOCK_BODY_LIMIT,
  COMPUTER_UNLOCK_TIMEOUT_MS,
  type ComputerUnlockCaller,
  type ComputerUnlockOwner,
  type ComputerUnlockReply,
} from '../../../computer/src/unlock-contract.js';

export function dispatchComputerUnlock({
  owner,
  ownerLan,
  caller,
  requests,
  id,
  input,
  send,
}: {
  owner: ComputerUnlockOwner | undefined;
  ownerLan: boolean;
  caller: ComputerUnlockCaller;
  requests: Map<string, () => void>;
  id: string;
  input: Record<string, unknown>;
  send: (message: Record<string, unknown>) => unknown;
}): void {
  const respond = (reply: ComputerUnlockReply) => {
    send({
      type: 'response',
      id,
      status: 200,
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(reply)).toString('base64'),
    });
  };
  if (!owner || !ownerLan) return respond({ code: 'unavailable' });
  if (input['method'] !== 'POST') return respond({ code: 'invalid' });
  const body = Buffer.from(
    typeof input['body'] === 'string' ? input['body'] : '',
    input['encoding'] === 'base64' ? 'base64' : 'utf8',
  );
  if (body.length > COMPUTER_UNLOCK_BODY_LIMIT) return respond({ code: 'invalid' });
  let command: unknown;
  try {
    command = JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    return respond({ code: 'invalid' });
  }
  const controller = new AbortController();
  const cancel = () => {
    clearTimeout(timer);
    controller.abort();
  };
  const complete = (reply: ComputerUnlockReply) => {
    if (requests.get(id) !== cancel) return;
    requests.delete(id);
    clearTimeout(timer);
    respond(reply);
  };
  const timer = setTimeout(() => {
    cancel();
    complete({ code: 'cancelled' });
  }, COMPUTER_UNLOCK_TIMEOUT_MS);
  requests.set(id, cancel);
  void owner
    .handle(caller, command, controller.signal)
    .then(complete, () => complete({ code: 'unavailable' }));
}
