import * as stylex from '@stylexjs/stylex';
import { observeHostResource } from './messaging-defaults-live.js';
import { useMessageHost } from './message-host.js';
import { ActionButton, ActionGroup } from './ds/action-button.js';
import { Button } from './ds/button.js';
import { hooked } from './ds/hooked.js';
import { RequestHeading, RequestOutcome, requestCardStyles as styles } from './ds/request-card.js';
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { errorMessage, type ToolApprovalExecutionState } from './bridge.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelMessage } from './store.js';
import { useConversationStore } from './use-client-store.js';
import { useMountedResource } from './mounted-resource.js';
import { subscribeWorkspaceGrantChanges } from './workspace-grant-events.js';
import type { CompanionRequestTarget } from './companion-requests.js';
import { approvalCountdown } from './approval-countdown.js';
import { ApprovalInput } from './approval-input.js';
import { approvalSummary } from '@botharness/host-client/shared/approval-diff';
import { BotCreateApprovalPreview, botCreateArgs } from './bot-create-approval.js';

function isReadTimeout(error: unknown): boolean {
  const cause: unknown = error instanceof Error ? error.cause : undefined;
  const failure = cause ?? error;
  if (typeof failure !== 'object' || failure === null) return false;
  return (
    ('name' in failure && (failure.name === 'TimeoutError' || failure.name === 'AbortError')) ||
    ('message' in failure &&
      typeof failure.message === 'string' &&
      /\b(?:timed out|did not answer in time)\b/iu.test(failure.message))
  );
}

export function ToolApprovalCard({
  message,
  actions,
  decision,
  t,
  companionTarget,
  channelId: sourceChannelId,
  surface = 'chat',
  hostScoped = false,
}: {
  surface?: 'chat' | 'activity';
  message: ChannelMessage;
  actions: Pick<
    BridgeActions,
    | 'requestHost'
    | 'toolApprovalStatus'
    | 'toolApprovalState'
    | 'toolApprovalExecutionState'
    | 'decideToolApproval'
  >;
  hostScoped?: boolean;
  channelId?: string | undefined;
  decision?:
    | 'allowed-once'
    | 'allowed-always-tool'
    | 'allowed-always-exact'
    | 'allowed-always-all'
    | 'rejected'
    | undefined;
  t: BotHarnessTranslate;
  companionTarget?: (CompanionRequestTarget & { callId: string }) | undefined;
}): ReactElement {
  const store = useConversationStore();
  const host = useMessageHost()?.client;
  const request = message.toolApprovalRequest!;
  const secretCli = request.toolName === 'secret_cli';
  const canAlwaysAllow = request.allowAlways ?? false;
  const [acceptedDecision, setAcceptedDecision] = useState<typeof decision>();
  const effectiveDecision = decision ?? acceptedDecision;
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const cardChannelId = sourceChannelId ?? 'dm-' + botSlug;
  const [status, setStatus] = useState<
    'loading' | 'pending' | 'expired' | 'stopped' | 'decided' | 'unavailable'
  >(decision === undefined ? 'loading' : 'decided');
  const [busy, setBusy] = useState(false);
  const [busyChoice, setBusyChoice] = useState<typeof decision>();
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
    let active = true;
    let loaded = false;
    const assignment = request.role === 'assignment';
    if (effectiveDecision === undefined) {
      setStatus('loading');
      setError(undefined);
    }
    const refresh = async () => {
      try {
        if (
          actions.toolApprovalState === undefined &&
          assignment &&
          actions.toolApprovalExecutionState !== undefined
        ) {
          try {
            const value = await actions.toolApprovalExecutionState(cardChannelId, message.id);
            if (active) setExecutionState(value);
          } catch (error) {
            if (active && !isReadTimeout(error)) setExecutionState(undefined);
          }
        }
        if (!active || (effectiveDecision !== undefined && actions.toolApprovalState === undefined))
          return;
        const snapshot = await (actions.toolApprovalState?.(cardChannelId, message.id) ??
          actions.toolApprovalStatus(cardChannelId, message.id).then((status) => ({
            status,
            expiresAt: undefined,
            execution: undefined,
          })));
        if (!active) return;
        loaded = true;
        if (assignment && actions.toolApprovalState !== undefined)
          setExecutionState(snapshot.execution);
        if (effectiveDecision === undefined) {
          setStatus((current) =>
            current === 'expired' || current === 'stopped' || current === 'decided'
              ? current
              : snapshot.status,
          );
          setExpiresAt(snapshot.expiresAt);
        }
        if (
          snapshot.status !== 'pending' &&
          (!assignment || snapshot.execution === 'settled' || snapshot.execution === 'needs-repair')
        )
          stop();
      } catch {
        if (active && !loaded && effectiveDecision === undefined)
          setStatus((current) => (current === 'loading' ? 'unavailable' : current));
      }
    };
    const watching = botSlug !== undefined && (assignment || effectiveDecision === undefined);
    const stop = watching
      ? observeHostResource(
          (change) =>
            change.resource === 'tool-approval' &&
            change.channelId === cardChannelId &&
            change.messageId === message.id,
          refresh,
          host ?? actions.requestHost?.(),
          (invalidate) => subscribeWorkspaceGrantChanges(botSlug, invalidate, actions),
        )
      : () => {};
    return () => {
      active = false;
      mounted.current = false;
      stop();
    };
  }, [
    actions,
    botSlug,
    cardChannelId,
    effectiveDecision,
    host,
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
    outcome:
      | 'allowed-once'
      | 'allowed-always-tool'
      | 'allowed-always-exact'
      | 'allowed-always-all'
      | 'rejected',
  ): void => {
    if (botSlug === undefined || submitting.current || !actionable) return;
    if (companionTarget && !qualified()) return;
    setBusy(true);
    setBusyChoice(outcome);
    setError(undefined);
    const channelId = cardChannelId;
    if (
      !hostScoped &&
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
              setStatus('unavailable');
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
  const disabled = busy || !actionable || (companionTarget !== undefined && !qualified());
  const selectedChoice =
    effectiveDecision === undefined ||
    effectiveDecision === 'allowed-once' ||
    effectiveDecision === 'rejected'
      ? effectiveDecision
      : 'allowed-always-tool';
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (surface === 'activity') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]') !== null) return;
    if (!actionable) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (disabled) return;
    const onCard = target === event.currentTarget;
    if (key === 'y' || (key === 'Enter' && onCard)) decide('allowed-once');
    else if (key === 'n' || key === 'Escape') decide('rejected');
    else if (key === 'a' && canAlwaysAllow) decide('allowed-always-tool');
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const compact = companionTarget !== undefined;
  const size = compact ? 'sm' : 'md';
  const summary = approvalSummary(request.toolName, request.input);
  const botCreate =
    request.toolName === 'bot_create' || request.toolName === 'deepseekbot create'
      ? botCreateArgs(request.input)
      : undefined;
  const category = t(
    botCreate !== undefined
      ? 'approval.category.bot'
      : request.toolName === 'bash' || request.toolName === 'shell'
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
      <code {...hooked('bh-tool-approval-line', styles.well, styles.preview)}>
        {summary.command}
      </code>
    ) : summary.file !== undefined ? (
      <span {...hooked('bh-tool-approval-line', styles.well, styles.preview)}>
        <code>{summary.file.path}</code>{' '}
        <span {...stylex.props(styles.added)} data-kind="add">
          +{summary.file.added}
        </span>{' '}
        <span {...stylex.props(styles.removed)} data-kind="remove">
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
      : status === 'expired' || status === 'stopped'
        ? status
        : undefined;
  const details = open ? (
    <div id={detailsId} {...hooked('bh-tool-approval-details-body', styles.group)}>
      <div {...stylex.props(styles.caption)}>
        {request.role === 'assignment' ? t('approval.assignment') : t('approval.orchestrator')}
        {' · '}
        {request.toolName}
      </div>
      <div {...hooked('bh-tool-approval-cwd', styles.caption)}>
        {t('approval.cwd', { path: request.cwd })}
      </div>
      <ApprovalInput
        toolName={request.toolName}
        input={request.input}
        t={t}
        caption={summary.description === undefined}
        compact={compact}
      />
      <div {...stylex.props(styles.caption)}>
        {t(
          request.toolName === 'channel_attachment_open'
            ? 'approval.originalRisk'
            : botCreate !== undefined
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
      {...hooked(
        'bh-tool-approval-card',
        styles.card,
        styles.focus,
        compact && styles.compact,
        !compact && surface === 'chat' && styles.approval,
        surface === 'activity' && styles.inset,
      )}
      data-compact={compact || undefined}
      tabIndex={actionable ? 0 : undefined}
      aria-label={actionable ? t('approval.requestTitle') : undefined}
      aria-keyshortcuts={
        actionable && surface !== 'activity'
          ? canAlwaysAllow
            ? 'Y Enter N Escape A'
            : 'Y Enter N Escape'
          : undefined
      }
      data-open={open || undefined}
      onKeyDown={onKeyDown}
      onClick={onCardClick}
    >
      <RequestHeading
        urgent={countdown?.urgent === true}
        pendingRef={countdownMount}
        pending={
          !actionable ? undefined : countdown !== undefined && soon ? (
            <time dateTime={expiresAt} title={new Date(expiresAt!).toLocaleString()}>
              {t(countdown.key, { count: String(countdown.count) })}
            </time>
          ) : (
            <span
              title={expiresAt === undefined ? undefined : new Date(expiresAt).toLocaleString()}
            >
              {t('approval.outcome.pending')}
            </span>
          )
        }
      >
        {category}
      </RequestHeading>
      <>
        <Button
          type="button"
          className="bh-request-summary"
          xstyle={styles.summary}
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          title={t(open ? 'approval.hideDetails' : 'approval.showDetails')}
          onClick={() => setOpen((current) => !current)}
        >
          <span {...hooked('bh-tool-approval-sentence', styles.prompt)}>{sentence}</span>
          {preview}
        </Button>
        {botCreate === undefined ? null : (
          <BotCreateApprovalPreview
            args={botCreate}
            preview={request.botCreatePreview}
            compact={compact && !open}
            t={t}
          />
        )}
        {request.effects === undefined ? null : (
          <div {...stylex.props(styles.caption)}>
            {t(`approval.effect.changes.${request.effects.changes}`)} ·{' '}
            {t(`approval.effect.reach.${request.effects.reach}`)}
          </div>
        )}
        {request.approvalReview === undefined ? null : (
          <div {...stylex.props(styles.caption)}>
            {request.approvalReview.kind === 'template-unavailable'
              ? t('autoApproval.unavailable')
              : request.approvalReview.fallback === undefined
                ? request.approvalReview.reason
                : t('autoApproval.reviewUnavailable')}
          </div>
        )}
        {details}
      </>
      {executionState === 'waiting-human' ||
      executionState === 'waiting-capacity' ||
      executionState === 'needs-repair' ? (
        <div role="status" {...stylex.props(styles.caption)}>
          {t(
            executionState === 'waiting-human'
              ? 'approval.waitingHumanCapacity'
              : executionState === 'waiting-capacity'
                ? 'approval.waitingCapacity'
                : 'approval.needsRepair',
          )}
        </div>
      ) : null}
      {effectiveDecision !== undefined || actionable ? (
        <div {...stylex.props(styles.caption)}>
          {canAlwaysAllow
            ? t(
                secretCli
                  ? 'approval.allowKindRisk'
                  : request.toolName === 'secret_mcp_connect'
                    ? 'approval.alwaysServiceScope'
                    : 'approval.alwaysToolScope',
                { tool: request.toolName },
              )
            : t('approval.alwaysUnavailable')}
        </div>
      ) : null}
      {settled !== undefined ? (
        <RequestOutcome
          outcome={settled}
          title={t(
            settled === 'denied'
              ? 'approval.rejected'
              : settled === 'allowed'
                ? 'approval.approved'
                : settled === 'expired'
                  ? 'approval.expired'
                  : settled === 'stopped'
                    ? 'approval.stopped'
                    : request.toolName === 'secret_mcp_connect'
                      ? 'approval.serverRemembered'
                      : 'approval.ruleSaved',
          )}
        >
          {category + ' · ' + t(`approval.outcome.${settled}`)}
        </RequestOutcome>
      ) : null}
      {effectiveDecision !== undefined || actionable ? (
        <ActionGroup groupRef={focusMount} className="bh-tool-approval-actions" stack>
          <ActionButton
            icon="check"
            pill
            tone="primary"
            size={size}
            disabled={disabled}
            aria-pressed={selectedChoice === 'allowed-once'}
            busy={busy && busyChoice === 'allowed-once'}
            onClick={() => decide('allowed-once')}
          >
            {t('approval.allowOnce')}
          </ActionButton>
          <ActionButton
            icon="shield-check"
            pill

            size={size}
            disabled={disabled || !canAlwaysAllow}
            aria-pressed={selectedChoice === 'allowed-always-tool'}
            busy={busy && busyChoice === 'allowed-always-tool'}
            onClick={() => decide('allowed-always-tool')}
          >
            {t('approval.allowAlways')}
          </ActionButton>
          <ActionButton
            icon="x"
            pill

            size={size}
            tone="danger"
            disabled={disabled}
            aria-pressed={selectedChoice === 'rejected'}
            busy={busy && busyChoice === 'rejected'}
            onClick={() => decide('rejected')}
          >
            {t('approval.reject')}
          </ActionButton>
        </ActionGroup>
      ) : status === 'loading' || status === 'unavailable' ? (
        <div role="status" {...stylex.props(styles.caption)}>
          {t(status === 'loading' ? 'approval.loading' : 'companion.requestUnavailable')}
        </div>
      ) : null}
      {status === 'unavailable' ? (
        <ActionGroup>
          <ActionButton
            icon="refresh"
            pill

            disabled={companionTarget !== undefined && !qualified()}
            onClick={() => setRetry((value) => value + 1)}
          >
            {t('companion.retryRequest')}
          </ActionButton>
        </ActionGroup>
      ) : null}
      {error === undefined ? null : (
        <div {...stylex.props(styles.caption, styles.error)} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
