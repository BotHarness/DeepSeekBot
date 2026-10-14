import { useContext, useId, useRef, useState, type ReactElement } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { errorMessage } from './bridge.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { store, type ChannelMessage } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import type { CompanionRequestTarget } from './companion-requests.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { MessageDeveloperMode } from './message-developer-mode.js';

export function UserQuestionCard({
  message,
  actions,
  resolution,
  t,
  companionTarget,
  channelId: sourceChannelId,
}: {
  message: ChannelMessage;
  actions: BridgeActions;
  channelId?: string | undefined;
  resolution?: 'answered' | 'cancelled' | undefined;
  t: BotHarnessTranslate;
  companionTarget?: CompanionRequestTarget | undefined;
}): ReactElement {
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
    let retry: ReturnType<typeof setTimeout> | undefined;
    if (resolution !== undefined) {
      setStatus(resolution);
    } else if (botSlug !== undefined) {
      if (companionTarget) setStatus('loading');
      setStatusError(false);
      const refresh = (): void => {
        void actions.userQuestionStatus(cardChannelId, message.id).then(
          (value) => {
            if (active) {
              setStatus(value);
              if (value === 'submitted') retry = setTimeout(refresh, 800);
            }
          },
          () => {
            if (active) setStatusError(true);
          },
        );
      };
      refresh();
    }
    return () => {
      active = false;
      mounted.current = false;
      clearTimeout(retry);
    };
  }, [actions, botSlug, message.id, resolution, statusRetry, companionTarget?.live]);

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
  const head = (
    <div className="bh-request-head">
      <span className="bh-request-category">{only?.header ?? t('question.category')}</span>
      <span className="bh-request-pill" data-state="pending">
        {t('question.outcome.pending')}
      </span>
    </div>
  );

  if (settled !== undefined)
    return (
      <div
        ref={questionMount}
        className="bh-question-card"
        data-compact={compact || undefined}
        data-settled={settled}
      >
        <div
          role="status"
          className="bh-request-done"
          data-state={settled}
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
        </div>
        {error === undefined ? null : (
          <div className="bh-error" role="alert">
            {error}
          </div>
        )}
      </div>
    );

  return (
    <div ref={questionMount} className="bh-question-card" data-compact={compact || undefined}>
      {head}
      {developerMode ? (
        <details className="bh-question-source">
          <summary>{t('question.source')}</summary>
          <code>{request.sessionId}</code>
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
          <div className="bh-question-item" key={question.id}>
            {only === undefined && question.header !== undefined ? (
              <div className="bh-note">{question.header}</div>
            ) : null}
            <div className="bh-question-prompt">{question.question}</div>
            {question.detail === undefined || !detailed ? null : (
              <div className="bh-note">{question.detail}</div>
            )}
            {question.options?.length ? (
              <>
                <SidebarCardList
                  label={question.question}
                  className={
                    tapAnswer ? 'bh-message-card-list bh-question-lettered' : 'bh-message-card-list'
                  }
                >
                  {question.options.map((option, index) => (
                    <SidebarCardRow
                      key={option.label}
                      leading={
                        tapAnswer ? undefined : (
                          <span
                            className="bh-question-letter"
                            data-multiple={question.multiSelect === true || undefined}
                            aria-hidden="true"
                          >
                            {String.fromCharCode(65 + (index % 26))}
                          </span>
                        )
                      }
                      title={option.label}
                      meta={detailed ? option.description : undefined}
                      selection={
                        tapAnswer
                          ? undefined
                          : {
                              checked: (selected[question.id] ?? []).includes(option.label),
                              multiple: question.multiSelect === true,
                            }
                      }
                      disabled={disabled}
                      onClick={() =>
                        tapAnswer
                          ? submit({ id: question.id, label: option.label })
                          : choose(question.id, option.label, question.multiSelect === true)
                      }
                    />
                  ))}
                </SidebarCardList>
                {field}
              </>
            ) : (
              <>
                <label className="bh-question-custom" htmlFor={inputId + '-' + question.id}>
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
          <div className="bh-message-card-actions">
            {showSubmit ? (
              <Button
                variant="primary"
                size={compact ? 'sm' : 'md'}
                className="bh-request-primary"
                disabled={disabled}
                onClick={() => submit()}
              >
                {t('question.submit')}
              </Button>
            ) : null}
            {showToggle ? (
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={expanded}
                onClick={() => setExpanded((current) => !current)}
              >
                {t('companion.details')}
              </Button>
            ) : null}
          </div>
        ) : null
      ) : (
        <div className="bh-note" role="status">
          {statusError ? (
            <>
              {t('question.statusUnavailable')}
              <Button
                variant="outline"
                disabled={companionTarget !== undefined && !qualified()}
                onClick={() => setStatusRetry((current) => current + 1)}
              >
                {t('question.retry')}
              </Button>
            </>
          ) : (
            t('approval.loading')
          )}
        </div>
      )}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
