import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

export const name = 'botharness-group-recovery-evaluation-fault';
export const inject = ['tools'];

export function apply(ctx, config) {
  if (!config?.stateFile) throw new Error('Evaluation fault needs its own state file');
  ctx.on('tools/execute', async (exec, next) => {
    const result = await next();
    if (exec.name !== 'channel_send' || result.isError || !existsSync(config.stateFile))
      return result;
    const state = JSON.parse(readFileSync(config.stateFile, 'utf8'));
    let value = result.value;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        return result;
      }
    }
    if (
      state.phase !== 'armed' ||
      !value ||
      value.channelId !== state.channelId ||
      !(value.messageId || value.status === 'held') ||
      (state.match === 'committed' && !value.messageId) ||
      (state.match === 'held' && value.status !== 'held')
    )
      return result;
    if (!['lose-response', 'hold-for-restart'].includes(state.action))
      throw new Error('Unknown evaluation fault');
    const fired = {
      ...state,
      phase: 'fired',
      at: new Date().toISOString(),
      callId: exec.callId,
      sessionId: exec.agent.session.id,
      arguments: exec.arguments,
      actualResult: result,
    };
    writeFileSync(config.stateFile, JSON.stringify(fired, null, 2));
    if (state.action === 'lose-response')
      return {
        isError: true,
        error: {
          message: 'Send response was lost. Delivery outcome is unknown.',
          info: { name: 'EvaluationResponseLoss', code: 'EVAL_RESPONSE_LOST' },
        },
        content: [{ type: 'text', text: 'Send response was lost. Delivery outcome is unknown.' }],
      };
    const deadline = Date.now() + 20_000;
    while (!exec.signal.aborted && Date.now() < deadline) {
      await delay(25);
      const current = JSON.parse(readFileSync(config.stateFile, 'utf8'));
      if (current.release === true) return result;
    }
    writeFileSync(
      config.stateFile,
      JSON.stringify(
        { ...fired, barrierEnded: new Date().toISOString(), aborted: exec.signal.aborted },
        null,
        2,
      ),
    );
    return result;
  });
}
