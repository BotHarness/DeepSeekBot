import { useRef, useState } from 'react';
import { MethodRefused, type HostClient } from '../../host/client';
import { retrySessionFailure, type SessionFailure } from '../../host/session-failure';
import { Button } from '../primitives/button';
import { t } from '../strings';
import { ActionCard, CardButtons, DetailRow } from './action-card';

export function SessionFailureCard({
  client,
  channelId,
  messageId,
  failure,
}: {
  client: HostClient;
  channelId: string;
  messageId: string;
  failure: SessionFailure;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [more, setMore] = useState(false);
  const submitting = useRef(false);
  const retry = (recovery?: 'compact' | 'new-session') => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    void retrySessionFailure(client, channelId, messageId, failure, recovery)
      .catch((cause: unknown) =>
        setError(
          cause instanceof MethodRefused
            ? cause.code === 'session-changed'
              ? t.sessionRecovery.changed
              : cause.code === 'bot-busy'
                ? t.sessionRecovery.busy
                : cause.code === 'compaction-failed'
                  ? t.sessionRecovery.compactionFailed
                  : cause.message
            : cause instanceof Error
              ? cause.message
              : t.sessionRecovery.failed,
        ),
      )
      .finally(() => {
        submitting.current = false;
        setBusy(false);
      });
  };
  const recoverable = failure.role === 'orchestrator' && !!failure.requestMessageId;
  const showRecovery = failure.code === 'CONTEXT_WINDOW_EXCEEDED' || more;
  return (
    <ActionCard
      category={t.sessionRecovery.failed}
      title={
        failure.code === 'CONTEXT_WINDOW_EXCEEDED'
          ? t.sessionRecovery.contextFull
          : failure.code === 'OUTPUT_TOKEN_LIMIT'
            ? t.sessionRecovery.outputLimit
            : t.sessionRecovery.details
      }
      busy={busy}
      {...(error === undefined ? {} : { error })}
      details={<DetailRow label={t.sessionRecovery.details} value={failure.detail} />}
    >
      <CardButtons stack>
        {failure.requestMessageId ? (
          <Button label={t.sessionRecovery.retry} testID="session-retry" onPress={() => retry()} />
        ) : null}
        {recoverable && !showRecovery ? (
          <Button
            label={t.sessionRecovery.more}
            testID="session-recovery-more"
            onPress={() => setMore(true)}
          />
        ) : null}
        {recoverable && showRecovery ? (
          <>
            <Button
              label={t.sessionRecovery.compact}
              testID="session-compact-retry"
              onPress={() => retry('compact')}
            />
            <Button
              label={t.sessionRecovery.newSession}
              testID="session-new-retry"
              onPress={() => retry('new-session')}
            />
          </>
        ) : null}
      </CardButtons>
    </ActionCard>
  );
}
