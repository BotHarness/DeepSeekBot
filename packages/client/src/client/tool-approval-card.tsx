import { useRef, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { errorMessage, type ToolApprovalExecutionState } from './bridge.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { store, type ChannelMessage } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import { WORKSPACE_GRANTS_CHANGED } from './workspace-grant-events.js';
import type { CompanionRequestTarget } from './companion-requests.js';

export function ToolApprovalCard({
  message,
  actions,
  decision,
  t,
  companionTarget,
}: {
  message: ChannelMessage;
  actions: BridgeActions;
  decision?:
    | 'allowed-once'
    | 'allowed-always-exact'
    | 'allowed-always-all'
    | 'rejected'
    | undefined;
  t: BotHarnessTranslate;
  companionTarget?: (CompanionRequestTarget & { callId: string }) | undefined;
}): ReactElement {
  const request = message.toolApprovalRequest!;
  const [acceptedDecision, setAcceptedDecision] = useState<typeof decision>();
  const effectiveDecision = decision ?? acceptedDecision;
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const [status, setStatus] = useState<
    'loading' | 'pending' | 'expired' | 'decided' | 'unavailable'
  >(decision === undefined ? 'loading' : 'decided');
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [executionState, setExecutionState] = useState<ToolApprovalExecutionState | undefined>();
  const [retry, setRetry] = useState(0);
  const target = useRef(companionTarget);
  target.current = companionTarget;
  const mounted = useRef(false);
  const submitting = useRef(false);
  const qualified = (): boolean => {
    const current = target.current;
    return (
      current !== undefined &&
      current.live &&
      current.botSlug === botSlug &&
      current.channelId === 'dm-' + botSlug &&
      current.sessionId === request.sessionId &&
      current.callId === request.callId
    );
  };
  const approvalMount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    if (effectiveDecision !== undefined) setStatus('decided');
    if (botSlug === undefined) return;
    let active = true;
    let poll: ReturnType<typeof setTimeout> | undefined;
    if (companionTarget && effectiveDecision === undefined) setStatus('loading');
    const refreshExecution = (): void => {
      if (request.role !== 'assignment' || actions.toolApprovalExecutionState === undefined) return;
      void actions.toolApprovalExecutionState('dm-' + botSlug, message.id).then(
        (value) => {
          if (!active) return;
          setExecutionState(value);
          if (
            value === 'waiting-human' ||
            value === 'waiting-capacity' ||
            (value === 'running' && effectiveDecision === undefined)
          )
            poll = setTimeout(refreshExecution, 1000);
        },
        () => {
          if (!active) return;
          setExecutionState(undefined);
          poll = setTimeout(refreshExecution, 2000);
        },
      );
    };
    const refreshStatus = (): void => {
      void actions.toolApprovalStatus('dm-' + botSlug, message.id).then(
        (value) => {
          if (active) {
            setStatus((current) =>
              current === 'expired' || current === 'decided' ? current : value,
            );
          }
        },
        () => {
          if (active) setStatus(companionTarget ? 'unavailable' : 'expired');
        },
      );
    };
    const onGrantChanged = (event: Event): void => {
      if ((event as CustomEvent<{ slug: string }>).detail?.slug === botSlug) refreshStatus();
    };
    if (effectiveDecision === undefined) refreshStatus();
    refreshExecution();
    window.addEventListener(WORKSPACE_GRANTS_CHANGED, onGrantChanged);
    return () => {
      active = false;
      mounted.current = false;
      clearTimeout(poll);
      window.removeEventListener(WORKSPACE_GRANTS_CHANGED, onGrantChanged);
    };
  }, [actions, botSlug, effectiveDecision, message.id, request.role, companionTarget?.live, retry]);
  const decide = (
    outcome: 'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected',
  ): void => {
    if (botSlug === undefined || submitting.current || status !== 'pending') return;
    if (companionTarget && !qualified()) return;
    setBusy(true);
    setError(undefined);
    const channelId = 'dm-' + botSlug;
    if (
      !companionTarget &&
      store.getSnapshot().selection?.kind !== 'inbox' &&
      store.getSnapshot().conversation.channel?.id !== channelId
    ) {
      setError(t('approval.channelChanged'));
      setBusy(false);
      return;
    }
    submitting.current = true;
    const submit = async (): Promise<void> => {
      if (companionTarget) {
        const current = await actions.toolApprovalStatus(channelId, message.id);
        if (!mounted.current || !qualified()) return;
        if (current !== 'pending') {
          setStatus(current);
          return;
        }
      }
      await actions.decideToolApproval(channelId, message.id, outcome);
      if (mounted.current) {
        setAcceptedDecision(outcome);
        setStatus('decided');
      }
    };
    void submit()
      .then(
        () => undefined,
        (cause: unknown) => {
          return actions.toolApprovalStatus(channelId, message.id).then(
            (latest) => {
              if (!mounted.current) return;
              setStatus(latest);
              setError(latest === 'pending' ? errorMessage(cause) : undefined);
            },
            () => {
              if (!mounted.current) return;
              setStatus(companionTarget ? 'unavailable' : 'expired');
              setError(errorMessage(cause));
            },
          );
        },
      )
      .finally(() => {
        submitting.current = false;
        if (mounted.current) setBusy(false);
      });
  };
  const disabled = busy || (companionTarget !== undefined && !qualified());
  return (
    <div ref={approvalMount} className="bh-tool-approval-card">
      <div className="bh-grant-request-title">{t('approval.requestTitle')}</div>
      <div className="bh-note">
        {request.role === 'assignment' ? t('approval.assignment') : t('approval.orchestrator')}
        {' · '}
        {request.toolName}
      </div>
      <div className="bh-note">{t('approval.cwd', { path: request.cwd })}</div>
      <pre className="bh-tool-approval-input">{request.input}</pre>
      <div className="bh-note">
        {t(
          request.toolName === 'channel_attachment_open'
            ? 'approval.originalRisk'
            : 'approval.risk',
        )}
      </div>
      {executionState === 'waiting-human' ||
      executionState === 'waiting-capacity' ||
      executionState === 'needs-repair' ? (
        <div role="status" className="bh-note">
          {t(
            executionState === 'waiting-human'
              ? 'approval.waitingHumanCapacity'
              : executionState === 'waiting-capacity'
                ? 'approval.waitingCapacity'
                : 'approval.needsRepair',
          )}
        </div>
      ) : null}
      {effectiveDecision !== undefined ? (
        <div role="status" className="bh-note">
          {effectiveDecision === 'rejected'
            ? t('approval.rejected')
            : effectiveDecision === 'allowed-once'
              ? t('approval.approved')
              : t('approval.ruleSaved')}
        </div>
      ) : status === 'pending' && !confirmAll ? (
        <div className="bh-tool-approval-actions bh-message-card-actions">
          <Button variant="primary" disabled={disabled} onClick={() => decide('allowed-once')}>
            {t('approval.allowOnce')}
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => decide('allowed-always-exact')}
          >
            {t('approval.allowExact')}
          </Button>
          <Button variant="outline" disabled={disabled} onClick={() => setConfirmAll(true)}>
            {t('approval.allowAll')}
          </Button>
          <Button variant="outline" disabled={disabled} onClick={() => decide('rejected')}>
            {t('approval.reject')}
          </Button>
        </div>
      ) : confirmAll && status === 'pending' ? null : (
        <div role="status" className="bh-note">
          {status === 'loading'
            ? t('approval.loading')
            : status === 'unavailable'
              ? t('companion.requestUnavailable')
              : t('approval.expired')}
        </div>
      )}
      {companionTarget && status === 'unavailable' ? (
        <div className="bh-message-card-actions">
          <Button
            variant="outline"
            disabled={!qualified()}
            onClick={() => setRetry((value) => value + 1)}
          >
            {t('companion.retryRequest')}
          </Button>
        </div>
      ) : null}
      {confirmAll && status === 'pending' ? (
        <div className="bh-message-card-actions">
          <div
            className="bh-tool-approval-confirm"
            role="group"
            aria-label={t('approval.allowAll')}
          >
            <div className="bh-note">{t('approval.allowAllRisk')}</div>
            <div className="bh-tool-approval-actions bh-message-card-actions">
              <Button
                variant="primary"
                disabled={disabled}
                onClick={() => decide('allowed-always-all')}
              >
                {t('approval.confirmAll')}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmAll(false)}>
                {t('approval.cancel')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
