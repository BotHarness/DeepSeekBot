import { useRef, useState, type ReactElement } from 'react';
import { IconCheckOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import * as stylex from '@stylexjs/stylex';
import { PersonaBotAvatar } from './avatar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { GroupHeading } from './ds/group-heading.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { space, color } from './ds/tokens.stylex.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import type { ApprovalTemplateView } from './bridge.js';
import { errorMessage } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelMessage } from './store.js';

const OFF = 'off';

const pageStyles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: space.x4, minWidth: 0 },
  check: { display: 'inline-flex', color: color.fg },
});

function templateTitle(t: BotHarnessTranslate, name: string, fallback: string | undefined): string {
  if (name === 'cautious') return t('autoApproval.template.cautious');
  if (name === 'get-work-done') return t('autoApproval.template.getWorkDone');
  return fallback ?? name;
}

function templateDescription(t: BotHarnessTranslate, template: ApprovalTemplateView): string {
  if (template.name === 'cautious') return t('autoApproval.template.cautiousHint');
  if (template.name === 'get-work-done') return t('autoApproval.template.getWorkDoneHint');
  return template.description;
}

type TemplateActions = {
  approvalTemplates?(
    slug: string,
  ): Promise<{ templates: ApprovalTemplateView[]; selected: string | null }>;
  setBotApprovalTemplate?(slug: string, template: string | null): Promise<void>;
};

function useApprovalTemplates<E extends HTMLElement>(botSlug: string, actions: TemplateActions) {
  const [templates, setTemplates] = useState<ApprovalTemplateView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
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
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (current.current === botSlug) setError(errorMessage(cause));
      });
  }, [actions, botSlug]);
  const choose = (name: string | null): void => {
    if (actions.setBotApprovalTemplate === undefined || busy) return;
    const previous = selected;
    setSelected(name);
    setBusy(true);
    setError(undefined);
    void actions
      .setBotApprovalTemplate(botSlug, name)
      .catch((cause: unknown) => {
        if (current.current !== botSlug) return;
        setSelected(previous);
        setError(errorMessage(cause));
      })
      .finally(() => {
        if (current.current === botSlug) setBusy(false);
      });
  };
  const available =
    actions.approvalTemplates !== undefined && actions.setBotApprovalTemplate !== undefined;
  return { mount, templates, selected, loaded, busy, error, choose, available };
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
  const chosen = state.templates.find((template) => template.name === state.selected);
  return (
    <>
      <SettingsSection title={t('autoApproval.section')}>
        <SettingsRow
          rootRef={state.mount}
          data={{ 'data-approval-template': '' }}
          title={t('autoApproval.title')}
          description={
            chosen === undefined
              ? t('autoApproval.hintOff')
              : t('autoApproval.hintOn', { description: templateDescription(t, chosen) })
          }
          control={
            <Select
              label={t('autoApproval.title')}
              value={state.selected ?? OFF}
              disabled={disabled || state.busy || state.templates.length === 0}
              options={[
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

type TemplateCard = { name: string | null; title: string; description: string };

export function AutoApprovalSettingsEntry({
  botSlug,
  actions,
  t,
}: ChannelSidebarEntryProps): ReactElement | null {
  const state = useApprovalTemplates<HTMLDivElement>(botSlug ?? '', actions);
  if (botSlug === undefined || !state.available) return null;
  const cards: TemplateCard[] = [
    { name: null, title: t('autoApproval.off'), description: t('autoApproval.offHint') },
    ...state.templates.map((template) => ({
      name: template.name,
      title: templateTitle(t, template.name, template.title),
      description: templateDescription(t, template),
    })),
  ];
  const active = cards.find((card) => card.name === state.selected) ?? cards[0]!;
  return (
    <div ref={state.mount} data-auto-approval-settings="" {...stylex.props(pageStyles.page)}>
      <Note>{t('autoApproval.hintOff')}</Note>
      {state.loaded ? (
        <>
          <section aria-label={t('autoApproval.activeSection')}>
            <GroupHeading quiet label={t('autoApproval.activeSection')} count="" />
            <SidebarCardList label={t('autoApproval.activeSection')}>
              <SidebarCardRow
                icon="shield-check"
                title={active.title}
                badge={<Tag tone="success">{t('autoApproval.activeTag')}</Tag>}
                meta={active.description}
                state="active"
              />
            </SidebarCardList>
          </section>
          <section aria-label={t('autoApproval.templatesSection')}>
            <GroupHeading
              quiet
              label={t('autoApproval.templatesSection')}
              count={<Tag tone="neutral">{cards.length}</Tag>}
            />
            <SidebarCardList label={t('autoApproval.templatesSection')}>
              {cards.map((card) => {
                const chosen = card.name === state.selected;
                return (
                  <SidebarCardRow
                    key={card.name ?? OFF}
                    icon={card.name === null ? 'eye-off' : 'shield-check'}
                    title={card.title}
                    meta={card.description}
                    selection={{ checked: chosen }}
                    disabled={state.busy}
                    trailing={
                      chosen ? (
                        <span {...stylex.props(pageStyles.check)}>
                          <IconCheckOutlineRegular size={16} />
                        </span>
                      ) : undefined
                    }
                    {...(chosen ? {} : { onClick: () => state.choose(card.name) })}
                  />
                );
              })}
            </SidebarCardList>
          </section>
        </>
      ) : state.error === undefined ? (
        <LoadingSkeleton kind="sidebar" label={t('autoApproval.title')} />
      ) : null}
      {state.error === undefined ? null : <Note tone="danger">{state.error}</Note>}
    </div>
  );
}

export function AutoApprovalBadge({ botSlug, actions, t }: ChannelSidebarEntryProps): ReactElement {
  const state = useApprovalTemplates<HTMLSpanElement>(botSlug ?? '', actions);
  const chosen = state.templates.find((template) => template.name === state.selected);
  return (
    <span ref={state.mount} className="bh-channel-sidebar-summary">
      {state.loaded ? (
        <Tag tone="neutral">
          {chosen === undefined
            ? t('autoApproval.off')
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
          {t(record.outcome === 'allowed' ? 'autoApproval.allowed' : 'autoApproval.rejected', {
            template,
          })}
        </span>
        <span className="bh-memory-commit-subject">{record.reason}</span>
        <span className="bh-memory-commit-files">{record.toolName}</span>
      </button>
      {open ? <pre className="bh-tool-approval-input">{record.input}</pre> : null}
    </div>
  );
}
