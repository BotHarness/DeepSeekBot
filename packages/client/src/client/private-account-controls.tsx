import { useRef, useState, type ReactElement } from 'react';
import {
  Button,
  IconRefreshOutlineRegular,
  IconCloseOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { store } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import type {
  PrivateAccountStatus,
  PrivateRevocationResult,
} from '../../../core/src/credentials/contracts.js';

export function PrivateAccountControls({
  channelId,
  messageId,
  actions,
  t,
}: {
  channelId: string;
  messageId: string;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [status, setStatus] = useState<PrivateAccountStatus['status'] | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<PrivateRevocationResult>();
  const lease = useRef<{ active: boolean; busy: boolean; terminal: boolean }>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    const current = { active: true, busy: false, terminal: false };
    lease.current = current;
    setStatus('loading');
    setBusy(false);
    setError(false);
    setResult(undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      void actions.privateAccountStatus?.(channelId, messageId).then(
        (value) => {
          if (!current.active || current.terminal) return;
          setStatus(value.status);
          setError(false);
          if (value.status !== 'configured') current.terminal = true;
          if (value.status === 'configured') timer = setTimeout(poll, 2500);
        },
        () => {
          if (current.active && !current.terminal) setError(true);
        },
      );
    };
    poll();
    return () => {
      current.active = false;
      clearTimeout(timer);
    };
  }, [actions, channelId, messageId]);
  const change = async (action: 'replace' | 'revoke') => {
    const current = lease.current;
    if (
      current?.active !== true ||
      current.busy ||
      status !== 'configured' ||
      store.getSnapshot().conversation.channel?.id !== channelId
    )
      return;
    current.busy = true;
    setBusy(true);
    setError(false);
    try {
      if (action === 'revoke') {
        const outcome = await actions.privateAccountRevoke?.(channelId, messageId);
        if (current.active) setResult(outcome);
      } else await actions.privateInputReplace?.(channelId, messageId);
      const account = await actions.privateAccountStatus?.(channelId, messageId);
      if (current.active && account !== undefined) {
        if (account.status !== 'configured') current.terminal = true;
        setStatus(account.status);
      }
    } catch {
      const account = await actions
        .privateAccountStatus?.(channelId, messageId)
        .catch(() => undefined);
      if (current.active) {
        if (account !== undefined && account.status !== 'configured') {
          current.terminal = true;
          setStatus(account.status);
          setError(false);
        } else if (!current.terminal) setError(true);
      }
    } finally {
      if (current.active) {
        current.busy = false;
        setBusy(false);
      }
    }
  };
  return (
    <div ref={mount}>
      {status === 'configured' ? (
        <div className="bh-private-input-actions bh-message-card-actions">
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<IconRefreshOutlineRegular size={14} />}
            disabled={busy}
            onClick={() => void change('replace')}
          >
            {t('privateInput.replace')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<IconCloseOutlineRegular size={14} />}
            disabled={busy}
            onClick={() => void change('revoke')}
          >
            {t('privateInput.revoke')}
          </Button>
        </div>
      ) : status === 'loading' ? (
        <div className="bh-note">{t('approval.loading')}</div>
      ) : (
        <div role="status" className="bh-note">
          {t(
            status === 'revoked'
              ? 'privateInput.revoked'
              : status === 'superseded'
                ? 'privateInput.superseded'
                : 'privateInput.unavailable',
          )}
        </div>
      )}
      {result === undefined ? null : (
        <div role="status" className="bh-note">
          {t('privateInput.stopSummary', {
            stopped: result.stopped,
            completed: result.completed,
            uncertain: result.uncertain,
          })}
        </div>
      )}
      {error ? (
        <div role="alert" className="bh-error">
          {t('privateInput.error')}
        </div>
      ) : null}
    </div>
  );
}
