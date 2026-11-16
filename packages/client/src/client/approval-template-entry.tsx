import { useRef, useState, type ReactElement } from 'react';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { PersonaBotAvatar } from './avatar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { useMountedResource } from './mounted-resource.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import type { ApprovalTemplateView } from './bridge.js';
import { errorMessage } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelMessage } from './store.js';

const OFF = 'off';
const INHERIT = '@global';
const UNKNOWN = '@unknown';

export function templateTitle(
  t: BotHarnessTranslate,
  name: string,
  fallback: string | undefined,
): string {
  if (name === 'cautious') return t('autoApproval.template.cautious');
  if (name === 'get-work-done') return t('autoApproval.template.getWorkDone');
  return fallback ?? name;
}

export function autoApprovalTemplateTitle(t: BotHarnessTranslate, name: string): string {
  return templateTitle(t, name, undefined);
}

export function templateDescription(
  t: BotHarnessTranslate,
  template: ApprovalTemplateView,
): string {
  if (template.name === 'cautious') return t('autoApproval.template.cautiousHint');
  if (template.name === 'get-work-done') return t('autoApproval.template.getWorkDoneHint');
  return template.description;
}

type TemplateActions = {
  approvalTemplates?(slug: string): Promise<{
    templates: ApprovalTemplateView[];
    selected: string | null;
    globalDefault?: string | null;
  }>;
  setBotApprovalTemplate?(slug: string, template: string | null): Promise<void>;
};

function useApprovalTemplates<E extends HTMLElement>(botSlug: string, actions: TemplateActions) {
  const [templates, setTemplates] = useState<ApprovalTemplateView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [globalDefault, setGlobalDefault] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const current = useRef(botSlug);
  current.current = botSlug;
  const mount = useMountedResource<E>(() => {
    setTemplates([]);
    setSelected(null);
    setLoaded(false);
    setError(undefined);
    if (actions.approvalTemplates === undefined) return;
    void actions
      .approvalTemplates(botSlug)
      .then((next) => {
        if (current.current !== botSlug) return;
        setTemplates(next.templates);
        setSelected(next.selected);
        setGlobalDefault(next.globalDefault ?? null);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (current.current === botSlug) setError(errorMessage(cause));
      });
  }, [actions, botSlug]);
  const choose = (name: string | null): void => {
    if (actions.setBotApprovalTemplate === undefined || !loaded || busy) return;
    const previous = selected;
    setSelected(name);
    setBusy(true);
    setError(undefined);
    void actions
      .setBotApprovalTemplate(botSlug, name)
      .then(async () => {
        const next = await actions.approvalTemplates?.(botSlug);
        if (next === undefined || current.current !== botSlug) return;
        setSelected(next.selected);
        setGlobalDefault(next.globalDefault ?? null);
        setTemplates(next.templates);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (current.current !== botSlug) return;
        setSelected(previous);
        setLoaded(false);
        setError(errorMessage(cause));
      })
      .finally(() => {
        if (current.current === botSlug) setBusy(false);
      });
  };
  const available =
    actions.approvalTemplates !== undefined && actions.setBotApprovalTemplate !== undefined;
  return {
    mount,
    templates,
    selected,
    effective: selected === INHERIT ? globalDefault : selected,
    loaded,
    busy,
    error,
    choose,
    available,
  };
}

export function ApprovalTemplateEntry({
  botSlug,
  actions,
  disabled,
  t,
}: {
  botSlug: string;
  actions: TemplateActions;
  disabled: boolean;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const state = useApprovalTemplates<HTMLDivElement>(botSlug, actions);
  if (!state.available) return null;
  const chosen = state.templates.find((template) => template.name === state.effective);
  return (
    <>
      <SettingsSection title={t('autoApproval.section')}>
        <SettingsRow
          rootRef={state.mount}
          data={{ 'data-approval-template': '' }}
          title={t('autoApproval.title')}
          description={
            !state.loaded
              ? t(
                  state.error === undefined
                    ? 'autoApproval.selectionLoading'
                    : 'autoApproval.selectionUnreadable',
                )
              : state.effective !== null && chosen === undefined
                ? t('autoApproval.unavailable')
                : state.selected === INHERIT
                  ? t('autoApproval.inherited', {
                      template:
                        chosen === undefined
                          ? t('autoApproval.off')
                          : templateTitle(t, chosen.name, chosen.title),
                    })
                  : chosen === undefined
                    ? t('autoApproval.hintOff')
                    : t('autoApproval.hintOn', { description: templateDescription(t, chosen) })
          }
          control={
            <Select
              label={t('autoApproval.title')}
              value={state.loaded ? (state.selected ?? OFF) : UNKNOWN}
              disabled={disabled || !state.loaded || state.busy || state.templates.length === 0}
              options={[
                ...(!state.loaded
                  ? [
                      {
                        value: UNKNOWN,
                        label: t(
                          state.error === undefined
                            ? 'autoApproval.loading'
                            : 'autoApproval.unreadable',
                        ),
                      },
                    ]
                  : []),
                ...(state.loaded &&
                state.selected !== null &&
                state.selected !== INHERIT &&
                !state.templates.some((template) => template.name === state.selected)
                  ? [
                      {
                        value: state.selected,
                        label: t('autoApproval.templateMissing', { name: state.selected }),
                      },
                    ]
                  : []),
                { value: INHERIT, label: t('autoApproval.inherit') },
                { value: OFF, label: t('autoApproval.off') },
                ...state.templates.map((template) => ({
                  value: template.name,
                  label: templateTitle(t, template.name, template.title),
                })),
              ]}
              onChange={(value) => state.choose(value === OFF ? null : value)}
            />
          }
        />
      </SettingsSection>
      {state.error === undefined ? null : (
        <Note tone="danger" inset>
          {state.error}
        </Note>
      )}
    </>
  );
}

export function AutoApprovalSettingsEntry({
  botSlug,
  actions,
  t,
}: ChannelSidebarEntryProps): ReactElement | null {
  if (botSlug === undefined) return null;
  return <ApprovalTemplateEntry botSlug={botSlug} actions={actions} disabled={false} t={t} />;
}

export function AutoApprovalBadge({ botSlug, actions, t }: ChannelSidebarEntryProps): ReactElement {
  const state = useApprovalTemplates<HTMLSpanElement>(botSlug ?? '', actions);
  const chosen = state.templates.find((template) => template.name === state.effective);
  return (
    <span ref={state.mount} className="bh-channel-sidebar-summary">
      {state.loaded ? (
        <Tag tone="neutral">
          {chosen === undefined
            ? t(state.effective === null ? 'autoApproval.off' : 'autoApproval.unreadable')
            : templateTitle(t, chosen.name, chosen.title)}
        </Tag>
      ) : null}
    </span>
  );
}

export function AutoApprovalLine({
  messageId,
  record,
  bots,
  t,
}: {
  messageId: string;
  record: NonNullable<ChannelMessage['toolAutoApproval']>;
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const bot = bots.find((candidate) => candidate.slug === record.botSlug);
  const name = bot?.displayName ?? record.botSlug;
  const template = templateTitle(t, record.template, undefined);
  return (
    <div className="bh-memory-commit-row" data-auto-approval={record.outcome}>
      <button
        type="button"
        className="bh-memory-commit-line bh-dm-trace-line"
        data-message-id={messageId}
        aria-expanded={open}
        title={t('autoApproval.tool', { tool: record.toolName })}
        onClick={() => setOpen((previous) => !previous)}
      >
        <ChannelSidebarIcon name="shield-check" size={14} />
        <span className="bh-bot-dm-action-bot">
          <span className="bh-bot-dm-action-avatar" aria-hidden="true">
            <PersonaBotAvatar
              t={t}
              personaBotId={record.botSlug}
              name={name}
              src={bot?.avatar}
              appearance={bot?.appearance}
              avatarSeed={bot?.avatarSeed}
              size={16}
              indicator={false}
              still
            />
          </span>
          <span className="bh-bot-dm-action-name">{name}</span>
        </span>
        <span>
          {t(
            record.outcome === 'allowed'
              ? 'autoApproval.allowed'
              : record.outcome === 'ask-human'
                ? 'autoApproval.askHuman'
                : 'autoApproval.rejected',
            {
              template,
            },
          )}
        </span>
        <span className="bh-memory-commit-subject">{record.reason}</span>
        <span className="bh-memory-commit-files">{record.toolName}</span>
      </button>
      {open ? <pre className="bh-tool-approval-input">{record.input}</pre> : null}
    </div>
  );
}

export function AutoApprovalPauseLine({
  messageId,
  record,
  bots,
  t,
}: {
  messageId: string;
  record: NonNullable<ChannelMessage['toolAutoApprovalPause']>;
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
}): ReactElement {
  const name = bots.find((candidate) => candidate.slug === record.botSlug)?.displayName;
  const params = {
    name: name ?? record.botSlug,
    template: templateTitle(t, record.template, undefined),
  };
  return (
    <div
      className="bh-member-departure"
      data-message-id={messageId}
      data-auto-approval-pause={record.state}
    >
      <span>
        {record.state === 'resumed'
          ? t('autoApproval.resumed', params)
          : t(
              record.reason === 'session'
                ? 'autoApproval.paused.session'
                : 'autoApproval.paused.consecutive',
              params,
            )}
      </span>
    </div>
  );
}
