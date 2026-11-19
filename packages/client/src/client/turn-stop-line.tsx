import * as stylex from '@stylexjs/stylex';
import { useState, type ReactElement } from 'react';

import { ChipButton } from './ds/chip-button.js';
import { joinClass } from './ds/class-name.js';
import { color, radius } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelMessage } from './store.js';
import { turnStopText } from './turn-stop.js';

const styles = stylex.create({
  limit: { flexWrap: 'wrap', justifyContent: 'center', borderRadius: radius.lg },
  done: { color: color.fg },
  failed: { flexBasis: '100%', color: color.danger },
});

export async function switchEngineToModel(botSlug: string): Promise<void> {
  const response = await fetch('./api/botharness/engines', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'use', bot: botSlug, role: 'orchestrator', engine: null }),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.ok) return;
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: unknown } };
  throw new Error(
    typeof body.error?.message === 'string' ? body.error.message : `HTTP ${response.status}`,
  );
}

type SwitchState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done' }
  | { kind: 'failed'; message: string };

export function TurnStopLine({
  messageId,
  stop,
  t,
  switchToModel = switchEngineToModel,
}: {
  messageId: string;
  stop: NonNullable<ChannelMessage['turnStop']>;
  t: BotHarnessTranslate;
  switchToModel?: (botSlug: string) => Promise<void>;
}): ReactElement {
  const [state, setState] = useState<SwitchState>({ kind: 'idle' });
  const botSlug = stop.botSlug;
  const engine = stop.cause === 'quota' ? stop.engine : undefined;
  if (engine === undefined || botSlug === undefined)
    return (
      <div className="bh-member-departure" data-message-id={messageId}>
        <span>{turnStopText(stop, t)}</span>
      </div>
    );
  return (
    <div
      className={joinClass('bh-member-departure', stylex.props(styles.limit).className)}
      data-message-id={messageId}
      data-engine-limit={engine.engine}
    >
      <span>{turnStopText(stop, t)}</span>
      {stop.routingGroup === true ? null : state.kind === 'done' ? (
        <span role="status" {...stylex.props(styles.done)}>
          {t('turn.switchedToModel')}
        </span>
      ) : (
        <ChipButton
          label={t(state.kind === 'busy' ? 'turn.switchingToModel' : 'turn.switchToModel')}
          disabled={state.kind === 'busy'}
          onClick={() => {
            setState({ kind: 'busy' });
            switchToModel(botSlug).then(
              () => setState({ kind: 'done' }),
              (error: unknown) =>
                setState({
                  kind: 'failed',
                  message: error instanceof Error ? error.message : String(error),
                }),
            );
          }}
        />
      )}
      {state.kind === 'failed' ? (
        <span role="alert" {...stylex.props(styles.failed)}>
          {t('turn.switchFailed', { message: state.message })}
        </span>
      ) : null}
    </div>
  );
}
