import * as stylex from '@stylexjs/stylex';
import { observeHostResource } from '../../messaging-defaults-live.js';
import { useMessageHost } from '../../message-host.js';
import { Input } from '../../ds/input.js';
import { ActionButton, ActionGroup } from '../../ds/action-button.js';
import { hooked } from '../../ds/hooked.js';
import {
  RequestHeading,
  RequestOption,
  RequestOptions,
  RequestOutcome,
  requestCardStyles as styles,
} from '../../ds/request-card.js';
import { useContext, useId, useRef, useState, type ReactElement } from 'react';
import { errorMessage } from '../../bridge.js';
import type { BridgeActions } from '../../actions.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { ChannelMessage } from '../../store.js';
import { useConversationStore } from '../../use-client-store.js';
import { useMountedResource } from '../../mounted-resource.js';
import type { CompanionRequestTarget } from '../../companion-requests.js';
import { MessageDeveloperMode } from '../../message-developer-mode.js';

export function UserQuestionCard({
  message,
  actions,
  resolution,
  t,
  companionTarget,
  channelId: sourceChannelId,
  hostScoped = false,
  inset = false,
}: {
  message: ChannelMessage;
  actions: Pick<BridgeActions, 'requestHost' | 'userQuestionStatus' | 'answerUserQuestion'>;
  hostScoped?: boolean;
  inset?: boolean;
  channelId?: string | undefined;
  resolution?: 'answered' | 'cancelled' | undefined;
  t: BotHarnessTranslate;
  companionTarget?: CompanionRequestTarget | undefined;
}): ReactElement {
  const store = useConversationStore();
  const host = useMessageHost()?.client;
  const developerMode = useContext(MessageDeveloperMode);
  const request = message.userQuestionRequest!;
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const cardChannelId = sourceChannelId ?? 'dm-' + botSlug;
  const [status, setStatus] = useState<
    'loading' | 'pending' | 'submitted' | 'expired' | 'answered' | 'cancelled'
  >(resolution ?? 'loading');
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [statusError, setStatusError] = useState(false);
  const [statusRetry, setStatusRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const inputId = useId();
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
      current.sessionId === request.sessionId
    );
  };

  const questionMount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    let active = true;
    let stop: (() => void) | undefined;
    if (resolution !== undefined) {
      setStatus(resolution);
    } else if (botSlug !== undefined) {
      if (companionTarget && statusRetry === 0) setStatus('loading');
      setStatusError(false);
      stop = observeHostResource(
        (change) =>
          change.resource === 'user-question' &&
          change.channelId === cardChannelId &&
          change.messageId === message.id,
        async () => {
          try {
            const value = await actions.userQuestionStatus(cardChannelId, message.id);
            if (!active) return;
            setStatus(value);
            setStatusError(false);
            if (value === 'answered' || value === 'expired') stop?.();
          } catch {
            if (active) setStatusError(true);
          }
        },
        host ?? actions.requestHost?.(),
      );
    }
    return () => {
      active = false;
      mounted.current = false;
      stop?.();
    };
  }, [
    actions,
    botSlug,
    cardChannelId,
    host,
    message.id,
    resolution,
    statusRetry,
    companionTarget?.live,
  ]);

  const choose = (id: string, label: string, multiSelect: boolean): void => {
    setSelected((current) => {
      const prior = current[id] ?? [];
      const next = multiSelect
        ? prior.includes(label)
          ? prior.filter((entry) => entry !== label)
          : [...prior, label]
        : [label];
      return { ...current, [id]: next };
    });
    if (!multiSelect) setCustom((current) => ({ ...current, [id]: '' }));
  };
  const submit = (pick?: { id: string; label: string }): void => {
    if (botSlug === undefined || submitting.current || status !== 'pending') return;
    if (companionTarget && !qualified()) return;
    const channelId = cardChannelId;
    if (
      !hostScoped &&
      !companionTarget &&
      store.getSnapshot().selection?.kind !== 'inbox' &&
      store.getSnapshot().conversation.channel?.id !== channelId
    ) {
      setError(t('question.channelChanged'));
      return;
    }
    const answers = request.questions.map((question) => {
      if (pick?.id === question.id) return { id: question.id, selected: [pick.label] };
      const text = (custom[question.id] ?? '').trim();
      return {
        id: question.id,
        selected:
          text.length > 0 && question.multiSelect !== true ? [] : (selected[question.id] ?? []),
        ...(text.length > 0 ? { custom: text } : {}),
      };
    });
    if (answers.some((answer) => answer.selected.length === 0 && answer.custom === undefined)) {
      setError(t('question.required'));
      return;
    }
    setBusy(true);
    submitting.current = true;
    setError(undefined);
    const submitAnswer = async (): Promise<void> => {
      if (companionTarget) {
        const current = await actions.userQuestionStatus(channelId, message.id);
        if (!mounted.current || !qualified()) return;
        if (current !== 'pending') {
          setStatus(current);
          return;
        }
      }
      await actions.answerUserQuestion(channelId, message.id, answers);
      if (mounted.current) {
        if (request.callId === undefined) setStatus('answered');
        else {
          setStatus('submitted');
          setStatusRetry((current) => current + 1);
        }
      }
    };
    void submitAnswer()
      .then(
        () => undefined,
        (cause: unknown) => {
          if (!mounted.current) return;
          setError(errorMessage(cause));
          setStatus('loading');
          setStatusRetry((current) => current + 1);
        },
      )
      .finally(() => {
        submitting.current = false;
        if (mounted.current) setBusy(false);
      });
  };
  const disabled = status !== 'pending' || busy || (companionTarget !== undefined && !qualified());
  const compact = companionTarget !== undefined;
  const only = request.questions.length === 1 ? request.questions[0] : undefined;
  const tapAnswer = only !== undefined && only.multiSelect !== true && !!only.options?.length;
  const typed = Object.values(custom).some((value) => value.trim().length > 0);
  const showSubmit = !tapAnswer || typed;
  const detailed =
    !compact ||
    expanded ||
    !request.questions.some(
      (question) =>
        question.detail !== undefined || question.options?.some((option) => option.description),
    );
  const showToggle = compact && (!detailed || expanded);

  const settled =
    status === 'answered' ||
    status === 'submitted' ||
    status === 'cancelled' ||
    status === 'expired'
      ? status
      : undefined;
  const cardStyle = hooked(
    'bh-question-card',
    styles.card,
    styles.question,
    compact && styles.compact,
    inset && styles.inset,
  );

  if (settled !== undefined)
    return (
      <div
        ref={questionMount}
        {...cardStyle}
        data-compact={compact || undefined}
        data-settled={settled}
      >
        <RequestOutcome
          outcome={settled}
          title={
            settled === 'expired'
              ? t('question.expired')
              : settled === 'submitted'
                ? t('question.submitted')
                : undefined
          }
        >
          {request.questions.map((question) => question.question).join(' · ') +
            ' · ' +
            t(`question.outcome.${settled}`)}
        </RequestOutcome>
        {error === undefined ? null : (
          <div {...stylex.props(styles.caption, styles.error)} role="alert">
            {error}
          </div>
        )}
      </div>
    );

  return (
    <div ref={questionMount} {...cardStyle} data-compact={compact || undefined}>
      <RequestHeading pending={t('question.outcome.pending')}>
        {only?.header ?? t('question.category')}
      </RequestHeading>
      {developerMode ? (
        <details {...hooked('bh-question-source', styles.caption)}>
          <summary>{t('question.source')}</summary>
          <code {...stylex.props(styles.preview)}>{request.sessionId}</code>
        </details>
      ) : null}
      {request.questions.map((question) => {
        const field = (
          <Input
            id={inputId + '-' + question.id}
            aria-label={t('question.custom')}
            value={custom[question.id] ?? ''}
            disabled={disabled}
            placeholder={t(
              question.options?.length ? 'question.otherPlaceholder' : 'question.customPlaceholder',
            )}
            onChange={(event) => {
              const value = event.target.value;
              setCustom((current) => ({ ...current, [question.id]: value }));
              if (question.multiSelect !== true && value.trim().length > 0) {
                setSelected((current) => ({ ...current, [question.id]: [] }));
              }
            }}
          />
        );
        return (
          <div {...hooked('bh-question-item', styles.group)} key={question.id}>
            {only === undefined && question.header !== undefined ? (
              <div {...stylex.props(styles.caption)}>{question.header}</div>
            ) : null}
            <div {...hooked('bh-question-prompt', styles.prompt)}>{question.question}</div>
            {question.detail === undefined || !detailed ? null : (
              <div {...stylex.props(styles.caption)}>{question.detail}</div>
            )}
            {question.options?.length ? (
              <>
                <RequestOptions label={question.question}>
                  {question.options.map((option, index) => (
                    <RequestOption
                      key={option.label}
                      letter={String.fromCharCode(65 + (index % 26))}
                      title={option.label}
                      description={detailed ? option.description : undefined}
                      selected={
                        tapAnswer ? undefined : (selected[question.id] ?? []).includes(option.label)
                      }
                      multiple={question.multiSelect === true}
                      disabled={disabled}
                      onChoose={() =>
                        tapAnswer
                          ? submit({ id: question.id, label: option.label })
                          : choose(question.id, option.label, question.multiSelect === true)
                      }
                    />
                  ))}
                </RequestOptions>
                {field}
              </>
            ) : (
              <>
                <label
                  {...hooked('bh-question-custom', styles.caption)}
                  htmlFor={inputId + '-' + question.id}
                >
                  {t('question.custom')}
                </label>
                {field}
              </>
            )}
          </div>
        );
      })}
      {status === 'pending' ? (
        showSubmit || showToggle ? (
          <ActionGroup>
            {showSubmit ? (
              <ActionButton
                icon="check"
                pill
                tone="primary"
                size={compact ? 'sm' : 'md'}
                busy={busy}
                disabled={disabled}
                onClick={() => submit()}
              >
                {t('question.submit')}
              </ActionButton>
            ) : null}
            {showToggle ? (
              <ActionButton
                icon="info"
                pill
                size="sm"
                aria-expanded={expanded}
                onClick={() => setExpanded((current) => !current)}
              >
                {t('companion.details')}
              </ActionButton>
            ) : null}
          </ActionGroup>
        ) : null
      ) : (
        <div {...stylex.props(styles.caption)} role="status">
          {statusError ? (
            <>
              {t('question.statusUnavailable')}
              <ActionButton
                icon="refresh"
                pill
                disabled={companionTarget !== undefined && !qualified()}
                onClick={() => setStatusRetry((current) => current + 1)}
              >
                {t('question.retry')}
              </ActionButton>
            </>
          ) : (
            t('approval.loading')
          )}
        </div>
      )}
      {error === undefined ? null : (
        <div {...stylex.props(styles.caption, styles.error)} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
