import { useRef, useState } from 'react';
import { MethodRefused, type HostClient } from '../../host/client';
import { maintainSessionFailure, type SessionFailure } from '../../host/session-failure';
import { useDesignTheme } from '../design/theme';
import { ArchiveIcon, PlusIcon, MessageIcon } from '../shell/icons';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const theme = useDesignTheme();
  const submitting = useRef(false);
  const maintain = (recovery: 'compact' | 'new-session') => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    void maintainSessionFailure(client, channelId, failure, recovery)
      .then((result) =>
        setNotice(
          result === 'new'
            ? t.sessionRecovery.newDone
            : result === 'compacted'
              ? t.sessionRecovery.compacted
              : t.sessionRecovery.nothing,
        ),
      )
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
  const recoverable =
    failure.role === 'orchestrator' && channelId.startsWith('dm-') && channelId.length > 3;
  const iconProps = { color: theme.color.fg, size: theme.type.body.size };
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
      <CardButtons>
        {recoverable ? (
          <>
            <Button
              label={t.sessionRecovery.compact}
              icon={<ArchiveIcon {...iconProps} />}
              testID="session-compact"
              disabled={busy}
              onPress={() => maintain('compact')}
            />
            <Button
              label={t.sessionRecovery.newSession}
              icon={<PlusIcon {...iconProps} />}
              testID="session-new"
              disabled={busy}
              onPress={() => maintain('new-session')}
            />
          </>
        ) : null}
        {onReport ? (
          <Button
            label={t.sessionRecovery.report}
            icon={<MessageIcon {...iconProps} />}
            testID="session-report"
            onPress={onReport}
          />
        ) : null}
      </CardButtons>
      {notice ? <Text>{notice}</Text> : null}
    </ActionCard>
  );
}
