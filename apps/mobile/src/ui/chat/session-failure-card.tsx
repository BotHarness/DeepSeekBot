import { useMemo, useSyncExternalStore } from 'react';
import type { HostClient } from '../../host/client';
import { createFailureMaintenance, type SessionFailure } from '../../host/session-failure';
import { Text } from '../primitives/text';
import { Button } from '../primitives/button';
import { t } from '../strings';
import { ActionCard, CardButtons, DetailRow } from './action-card';

export function SessionFailureCard({
  client,
  channelId,
  failure,
  onReport,
}: {
  client: HostClient;
  channelId: string;
  messageId: string;
  failure: SessionFailure;
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
  const busy = state.pending !== undefined;
  const notices = {
    new: t.sessionRecovery.newDone,
    compacted: t.sessionRecovery.compacted,
    nothing: t.sessionRecovery.nothing,
    busy: t.sessionRecovery.busy,
    failed: t.sessionRecovery.compactionFailed,
    unavailable: t.sessionRecovery.failed,
  };
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
      details={<DetailRow label={t.sessionRecovery.details} value={failure.detail} />}
    >
      <CardButtons>
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
      {state.notice ? <Text accessibilityLiveRegion="polite">{notices[state.notice]}</Text> : null}
    </ActionCard>
  );
}
