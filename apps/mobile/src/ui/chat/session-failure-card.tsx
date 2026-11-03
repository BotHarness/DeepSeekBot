import { useMemo, useSyncExternalStore } from 'react';
import type { HostClient } from '../../host/client';
import {
  createFailureContinuation,
  createFailureMaintenance,
  type SessionFailure,
} from '../../host/session-failure';
import {
  autoContinueSeconds,
  readSeconds,
  subscribeNever,
  subscribeSeconds,
} from '../../../../../packages/client/src/shared/turn-continuation';
import { Button } from '../primitives/button';
import { t } from '../strings';
import { ActionCard, CardButtons, CardNote, CardPreview, DetailRow } from './action-card';

export function SessionFailureCard({
  client,
  channelId,
  messageId,
  failure,
  latest = false,
  onReport,
}: {
  client: HostClient;
  channelId: string;
  messageId: string;
  failure: SessionFailure;
  latest?: boolean;
  onReport?: (() => void) | undefined;
}) {
  const maintenance = useMemo(
    () => createFailureMaintenance(client, channelId, failure),
    [client, channelId, failure.role],
  );
  const state = useSyncExternalStore(
    maintenance.subscribe,
    maintenance.getSnapshot,
    maintenance.getSnapshot,
  );
  const continuation = useMemo(
    () => createFailureContinuation(client, channelId, messageId, failure),
    [client, channelId, messageId, failure.role, failure.requestMessageId],
  );
  const continued = useSyncExternalStore(
    continuation.subscribe,
    continuation.getSnapshot,
    continuation.getSnapshot,
  );
  const waiting =
    continuation.available &&
    latest &&
    !continued.settled &&
    !continued.cancelled &&
    failure.autoContinue !== undefined;
  const now = useSyncExternalStore(
    waiting ? subscribeSeconds : subscribeNever,
    readSeconds,
    readSeconds,
  );
  const seconds = waiting ? autoContinueSeconds(failure.autoContinue, now) : undefined;
  const progress = failure.progress;
  const busy = state.pending !== undefined || continued.pending !== undefined;
  const continueNotices = {
    busy: t.sessionRecovery.busy,
    changed: t.sessionRecovery.continueChanged,
    unavailable: t.sessionRecovery.continueUnavailable,
    failed: t.sessionRecovery.continueFailed,
    cancelled: t.sessionRecovery.autoContinueCancelled,
  };
  const notices = {
    new: t.sessionRecovery.newDone,
    compacted: t.sessionRecovery.compacted,
    nothing: t.sessionRecovery.nothing,
    busy: t.sessionRecovery.busy,
    failed: t.sessionRecovery.compactionFailed,
    unsaved: t.sessionRecovery.unsaved,
    unavailable: t.sessionRecovery.failed,
  };
  const refusal = failure.code === undefined ? undefined : t.sessionRecovery.refused[failure.code];
  return (
    <ActionCard
      category={t.sessionRecovery.failed}
      title={
        refusal !== undefined
          ? refusal[0]
          : failure.code === 'CONTEXT_WINDOW_EXCEEDED'
            ? t.sessionRecovery.contextFull
            : failure.code === 'OUTPUT_TOKEN_LIMIT'
              ? t.sessionRecovery.outputLimit
              : t.sessionRecovery.details
      }
      preview={
        refusal?.[1] !== undefined ? (
          <CardPreview text={refusal[1]} well={false} variant="body" />
        ) : progress !== undefined && (progress.completedSteps > 0 || progress.lastTool) ? (
          <CardPreview
            text={[
              progress.lastTool === undefined
                ? t.sessionRecovery.progressNoTool(progress.completedSteps)
                : t.sessionRecovery.progress(progress.completedSteps, progress.lastTool),
              ...(progress.unknownTools === undefined
                ? []
                : [t.sessionRecovery.unknownTools(progress.unknownTools.join(', '))]),
            ].join('\n')}
            well={false}
            variant="body"
          />
        ) : undefined
      }
      details={<DetailRow label={t.sessionRecovery.details} value={failure.detail} />}
    >
      {seconds === undefined || failure.autoContinue === undefined ? null : (
        <CardNote variant="body" live>
          {t.sessionRecovery.autoContinue(
            seconds,
            failure.autoContinue.attempt,
            failure.autoContinue.maxAttempts,
          )}
        </CardNote>
      )}
      <CardButtons>
        {continuation.available && !continued.settled ? (
          <Button
            label={t.sessionRecovery.continue}
            symbol="refresh"
            tone="primary"
            busy={continued.pending === 'continue'}
            testID="session-continue"
            disabled={busy}
            onPress={() => void continuation.continueTurn()}
          />
        ) : null}
        {seconds === undefined ? null : (
          <Button
            label={t.sessionRecovery.autoContinueCancel}
            symbol="x"
            busy={continued.pending === 'cancel'}
            testID="session-auto-continue-cancel"
            disabled={busy}
            onPress={() => void continuation.cancelAuto()}
          />
        )}
        {maintenance.available ? (
          <>
            <Button
              label={t.sessionRecovery.compact}
              symbol="archive"
              busy={state.pending === 'compact'}
              testID="session-compact"
              disabled={busy}
              onPress={() => void maintenance.run('compact')}
            />
            <Button
              label={t.sessionRecovery.newSession}
              symbol="plus"
              busy={state.pending === 'new-session'}
              testID="session-new"
              disabled={busy}
              onPress={() => void maintenance.run('new-session')}
            />
          </>
        ) : null}
        {onReport ? (
          <Button
            label={t.sessionRecovery.report}
            symbol="message-square"
            testID="session-report"
            onPress={onReport}
          />
        ) : null}
      </CardButtons>
      {state.notice ? (
        <CardNote variant="body" live>
          {notices[state.notice]}
        </CardNote>
      ) : null}
      {continued.notice ? (
        <CardNote variant="body" live>
          {continueNotices[continued.notice]}
        </CardNote>
      ) : null}
    </ActionCard>
  );
}
