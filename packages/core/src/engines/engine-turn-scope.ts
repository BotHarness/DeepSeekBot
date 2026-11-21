import type { EngineSteering } from './assignment-steering.js';
import { engineGatewayResult } from './engine-gateway.js';
import type { EngineToolContext, EngineTurnRequest } from './engine-host-types.js';

export interface TurnScope {
  channelId: string | undefined;
  canUseChannel: EngineTurnRequest['canUseChannel'];
  steer?: EngineSteering['steer'];
  execute: EngineTurnRequest['execute'];
  pendingReplies: Set<Promise<unknown>>;
  context?: EngineToolContext;
  signal: AbortSignal;
}

export async function executeEngineTurnTool(
  turn: TurnScope | undefined,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
) {
  if (turn?.context === undefined || turn.signal.aborted)
    return { text: 'refused: session-not-running', isError: true };

  const execution = turn.execute(name, args, AbortSignal.any([signal, turn.signal]), turn.context);
  const replying =
    name === 'bot_send_message' || (name === 'tool_call' && args['name'] === 'bot_send_message');
  if (replying) turn.pendingReplies.add(execution);
  try {
    return engineGatewayResult(await execution);
  } finally {
    if (replying) turn.pendingReplies.delete(execution);
  }
}
