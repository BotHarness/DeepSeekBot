import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { errorMessage, type ToolApprovalExecutionState } from './bridge.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { store, type ChannelMessage } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import { WORKSPACE_GRANTS_CHANGED } from './workspace-grant-events.js';
import type { CompanionRequestTarget } from './companion-requests.js';
import { channelSettings } from './channel-settings-state.js';
import { approvalCountdown } from './approval-countdown.js';
import { ApprovalInput } from './approval-input.js';
import { approvalSummary } from './approval-diff.js';
import { BotCreateApprovalPreview, botCreateArgs } from './bot-create-approval.js';

export function ToolApprovalCard({
  message,
  actions,
  decision,
  t,
  companionTarget,
  channelId: sourceChannelId,
  surface = 'chat',
}: {
  surface?: 'chat' | 'activity';
  message: ChannelMessage;
  actions: BridgeActions;
  channelId?: string | undefined;
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
  const secretCli = request.toolName === 'secret_cli';
  const eachUse = secretCli || request.toolName === 'secret_mcp_connect';
  const [acceptedDecision, setAcceptedDecision] = useState<typeof decision>();
  const effectiveDecision = decision ?? acceptedDecision;
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const cardChannelId = sourceChannelId ?? 'dm-' + botSlug;
  const [status, setStatus] = useState<
    'loading' | 'pending' | 'expired' | 'decided' | 'unavailable'
  >(decision === undefined ? 'loading' : 'decided');
  const [busy, setBusy] = useState(false);
  const [busyChoice, setBusyChoice] = useState<typeof decision>();
  const [confirmAll, setConfirmAll] = useState(false);
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const [error, setError] = useState<string | undefined>();
  const [executionState, setExecutionState] = useState<ToolApprovalExecutionState | undefined>();
  const [retry, setRetry] = useState(0);
  const [expiresAt, setExpiresAt] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
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
      current.channelId === cardChannelId &&
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
      void actions.toolApprovalExecutionState(cardChannelId, message.id).then(
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
      void (
        actions.toolApprovalState?.(cardChannelId, message.id) ??
        actions.toolApprovalStatus(cardChannelId, message.id).then((value) => ({ status: value }))
      ).then(
        ({
          status: value,
          expiresAt: expiry,
        }: {
          status: 'pending' | 'expired';
          expiresAt?: string;
        }) => {
          if (active) {
            setStatus((current) =>
              current === 'expired' || current === 'decided' ? current : value,
            );
            setExpiresAt(expiry);
          }
        },
        () => {
          if (active)
            setStatus(companionTarget || surface === 'activity' ? 'unavailable' : 'expired');
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
  }, [
    actions,
    botSlug,
    effectiveDecision,
    message.id,
    request.role,
    companionTarget?.live,
    retry,
    surface,
  ]);
  const countdown =
    status === 'pending' && effectiveDecision === undefined && expiresAt !== undefined
      ? approvalCountdown(expiresAt, now)
      : undefined;
  const countdownMount = useMountedResource<HTMLElement>(() => {
    if (expiresAt === undefined) return;
    const next = approvalCountdown(expiresAt, Date.now());
    if (next === undefined) return;
    const timer = setTimeout(
      () => {
        const at = Date.now();
        if (approvalCountdown(expiresAt, at) === undefined) setStatus('expired');
        else setNow(at);
      },
      Math.min(next.nextTick, 60_000),
    );
    return () => clearTimeout(timer);
  }, [expiresAt, now]);
  const actionable = status === 'pending' && effectiveDecision === undefined;
  const focusMount = useMountedResource<HTMLDivElement>(
    (node) => {
      if (companionTarget !== undefined || surface === 'activity') return;
      const active = document.activeElement;
      if (active === null || active === document.body)
        node.closest<HTMLElement>('.bh-tool-approval-card')?.focus({ preventScroll: true });
    },
    [companionTarget, surface],
  );
  const decide = (
    outcome: 'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected',
  ): void => {
    if (botSlug === undefined || submitting.current || status !== 'pending') return;
    if (companionTarget && !qualified()) return;
    setBusy(true);
    setBusyChoice(outcome);
    setError(undefined);
    const channelId = cardChannelId;
    if (
      !companionTarget &&
      surface !== 'activity' &&
      store.getSnapshot().selection?.kind !== 'inbox' &&
      store.getSnapshot().conversation.channel?.id !== channelId
    ) {
      setError(t('approval.channelChanged'));
      setBusy(false);
      return;
    }
    submitting.current = true;
    const submit = async (): Promise<void> => {
      if (companionTarget || surface === 'activity') {
        const current = await actions.toolApprovalStatus(channelId, message.id);
        if (!mounted.current || (companionTarget !== undefined && !qualified())) return;
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
              setStatus(companionTarget || surface === 'activity' ? 'unavailable' : 'expired');
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
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (surface === 'activity') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]') !== null) return;
    if (!actionable) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (confirmAll) {
      if (key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setConfirmAll(false);
      event.currentTarget.focus({ preventScroll: true });
      return;
    }
    if (disabled) return;
    const onCard = target === event.currentTarget;
    if (key === 'y' || (key === 'Enter' && onCard)) decide('allowed-once');
    else if (key === 'n' || key === 'Escape') decide('rejected');
    else if (key === 'a' && !eachUse) setConfirmAll(true);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const compact = companionTarget !== undefined;
  const size = compact ? 'sm' : 'md';
  const summary = approvalSummary(request.toolName, request.input);
  const botCreate = request.toolName === 'bot_create' ? botCreateArgs(request.input) : undefined;
  const category = t(
    botCreate !== undefined
      ? 'approval.category.bot'
      : request.toolName === 'bash'
        ? 'approval.category.terminal'
        : summary.file !== undefined
          ? 'approval.category.file'
          : request.toolName.startsWith('browser')
            ? 'approval.category.browser'
            : 'approval.category.tool',
  );
  const sentence =
    (botCreate === undefined
      ? undefined
      : t('approval.botCreate.summary', { name: botCreate.displayName })) ??
    summary.description ??
    (summary.command !== undefined
      ? t('approval.summaryCommand')
      : summary.file !== undefined
        ? t('approval.summaryFile')
        : t('approval.summaryTool', { tool: request.toolName }));
  const preview =
    summary.command !== undefined ? (
      <code className="bh-tool-approval-line">{summary.command}</code>
    ) : summary.file !== undefined ? (
      <span className="bh-tool-approval-line">
        <code>{summary.file.path}</code>{' '}
        <span className="bh-tool-approval-diff-stat" data-kind="add">
          +{summary.file.added}
        </span>{' '}
        <span className="bh-tool-approval-diff-stat" data-kind="remove">
          −{summary.file.removed}
        </span>
      </span>
    ) : null;
  const soon = countdown !== undefined && countdown.key !== 'approval.expiresInHours';
  const settled =
    effectiveDecision !== undefined
      ? effectiveDecision === 'rejected'
        ? 'denied'
        : effectiveDecision === 'allowed-once'
          ? 'allowed'
          : 'remembered'
      : status === 'expired' ||
          (status === 'unavailable' && companionTarget === undefined && surface !== 'activity')
        ? 'expired'
        : undefined;
  const details = open ? (
    <div
      id={detailsId}
      className={
        compact
          ? 'bh-tool-approval-details-body bh-companion-details'
          : 'bh-tool-approval-details-body'
      }
    >
      <div className="bh-note">
        {request.role === 'assignment' ? t('approval.assignment') : t('approval.orchestrator')}
        {' · '}
        {request.toolName}
      </div>
      <div className="bh-note">{t('approval.cwd', { path: request.cwd })}</div>
      <ApprovalInput
        toolName={request.toolName}
        input={request.input}
        t={t}
        caption={summary.description === undefined}
      />
      <div className="bh-note">
        {t(
          request.toolName === 'channel_attachment_open'
            ? 'approval.originalRisk'
            : request.toolName === 'bot_create'
              ? 'approval.botCreateRisk'
              : request.toolName === 'secret_cli'
                ? 'approval.secretCliRisk'
                : request.toolName === 'secret_mcp_connect'
                  ? 'approval.secretMcpRisk'
                  : 'approval.risk',
        )}
      </div>
    </div>
  ) : null;
  const onCardClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (settled !== undefined) return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        'button, a, input, textarea, select, label, [role="group"], .bh-tool-approval-details-body',
      ) !== null
    )
      return;
    if ((window.getSelection()?.toString() ?? '') !== '') return;
    setOpen((current) => !current);
  };
  return (
    <div
      ref={approvalMount}
      className="bh-tool-approval-card"
      data-compact={compact || undefined}
      tabIndex={actionable ? 0 : undefined}
      aria-label={actionable ? t('approval.requestTitle') : undefined}
      aria-keyshortcuts={
        actionable && surface !== 'activity'
          ? eachUse
            ? 'Y Enter N Escape'
            : 'Y Enter N Escape A'
          : undefined
      }
      data-open={(settled === undefined && open) || undefined}
      onKeyDown={onKeyDown}
      onClick={onCardClick}
    >
      {settled !== undefined ? (
        <div
          role="status"
          className="bh-request-done"
          data-state={settled}
          title={t(
            settled === 'denied'
              ? 'approval.rejected'
              : settled === 'allowed'
                ? 'approval.approved'
                : settled === 'expired'
                  ? 'approval.expired'
                  : request.toolName === 'secret_mcp_connect'
                    ? 'approval.serverRemembered'
                    : 'approval.ruleSaved',
          )}
        >
          {category + ' · ' + t(`approval.outcome.${settled}`)}
        </div>
      ) : (
        <div className="bh-request-head">
          <span className="bh-request-category">{category}</span>
          {status === 'pending' ? (
            <span
              ref={countdownMount}
              className="bh-request-pill"
              data-state="pending"
              data-urgent={countdown?.urgent || undefined}
            >
              {countdown !== undefined && soon ? (
                <time dateTime={expiresAt} title={new Date(expiresAt!).toLocaleString()}>
                  {t(countdown.key, { count: String(countdown.count) })}
                </time>
              ) : (
                <span
                  title={expiresAt === undefined ? undefined : new Date(expiresAt).toLocaleString()}
                >
                  {t('approval.outcome.pending')}
                </span>
              )}
            </span>
          ) : null}
        </div>
      )}
      {settled !== undefined ? null : (
        <>
          <button
            type="button"
            className="bh-request-summary"
            aria-expanded={open}
            aria-controls={open ? detailsId : undefined}
            title={t(open ? 'approval.hideDetails' : 'approval.showDetails')}
            onClick={() => setOpen((current) => !current)}
          >
            <span className="bh-tool-approval-sentence">{sentence}</span>
            {preview}
          </button>
          {botCreate === undefined ? null : (
            <BotCreateApprovalPreview args={botCreate} preview={request.botCreatePreview} t={t} />
          )}
          {details}
        </>
      )}
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
      {settled === undefined && status === 'pending' && !confirmAll && secretCli ? (
        <div className="bh-note">{t('approval.allowKindRisk')}</div>
      ) : null}
      {settled !== undefined ? null : status === 'pending' && !confirmAll ? (
        <div
          ref={focusMount}
          className="bh-tool-approval-actions bh-message-card-actions"
          data-stack
        >
          <Button
            variant="primary"
            size={size}
            className="bh-request-primary"
            disabled={disabled}
            aria-busy={busy && busyChoice === 'allowed-once'}
            onClick={() => decide('allowed-once')}
          >
            {t(
              busy && surface === 'activity' && busyChoice === 'allowed-once'
                ? 'activityInbox.submitting'
                : 'approval.allowOnce',
            )}
          </Button>
          <Button
            variant="outline"
            size={size}
            className="bh-request-secondary"
            disabled={disabled}
            aria-busy={busy && busyChoice === 'allowed-always-exact'}
            onClick={() => decide('allowed-always-exact')}
          >
            {t(
              busy && surface === 'activity' && busyChoice === 'allowed-always-exact'
                ? 'activityInbox.submitting'
                : request.toolName === 'secret_mcp_connect'
                  ? 'approval.allowAndRemember'
                  : secretCli
                    ? 'approval.allowKind'
                    : 'approval.allowExact',
            )}
          </Button>
          {eachUse || surface === 'activity' ? null : (
            <Button
              variant="outline"
              size={size}
              className="bh-request-secondary"
              disabled={disabled}
              onClick={() => setConfirmAll(true)}
            >
              {t('approval.allowAll')}
            </Button>
          )}
          <Button
            variant="outline"
            size={size}
            className="bh-request-danger"
            disabled={disabled}
            aria-busy={busy && busyChoice === 'rejected'}
            onClick={() => decide('rejected')}
          >
            {t(
              busy && surface === 'activity' && busyChoice === 'rejected'
                ? 'activityInbox.submitting'
                : 'approval.reject',
            )}
          </Button>
        </div>
      ) : status === 'loading' || status === 'unavailable' ? (
        <div role="status" className="bh-note">
          {t(status === 'loading' ? 'approval.loading' : 'companion.requestUnavailable')}
        </div>
      ) : null}
      {status === 'pending' &&
      effectiveDecision === undefined &&
      !confirmAll &&
      !eachUse &&
      companionTarget === undefined &&
      surface !== 'activity' &&
      request.role === 'orchestrator' &&
      cardChannelId === 'dm-' + botSlug ? (
        <button
          type="button"
          className="bh-request-link"
          onClick={() => channelSettings.open('workspace-grants')}
        >
          {t('approval.fullAccessEntry')}
        </button>
      ) : null}
      {(companionTarget || surface === 'activity') && status === 'unavailable' ? (
        <div className="bh-message-card-actions">
          <Button
            variant="outline"
            disabled={companionTarget !== undefined && !qualified()}
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
                size={size}
                className="bh-request-primary"
                disabled={disabled}
                onClick={() => decide('allowed-always-all')}
              >
                {t('approval.confirmAll')}
              </Button>
              <Button
                variant="outline"
                size={size}
                className="bh-request-secondary"
                disabled={busy}
                onClick={() => setConfirmAll(false)}
              >
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
