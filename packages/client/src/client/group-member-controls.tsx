import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  Button,
  IconEllipsisOutlineRegular,
  IconPlusOutlineRegular,
  Menu,
  Tag,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { useClientState } from './bot-sidebar.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { useDelayedSearch } from './delayed-search.js';
import { Field, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import { humanLabel } from './actor-names.js';
import type { BotHarnessTranslate } from './locale.js';
import { personaBotActivity } from './persona-activity.js';
import type { BotSummary, ChannelSummary } from './store.js';
import { IconButton } from './ds/icon-button.js';

const styles = stylex.create({
  attentionHeading: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  attentionItem: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x3,
    paddingBlock: space.x2,
  },
  attentionName: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: '100px',
    overflowWrap: 'anywhere',
  },
  attentionActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: space.x3,
    width: '100%',
  },
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    minWidth: 0,
    maxHeight: '280px',
    overflowY: 'auto',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    width: '100%',
    minWidth: 0,
    minHeight: size.nav,
    paddingInline: space.x3,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  optionOn: {
    backgroundColor: { default: color.selected, ':hover': color.selected },
  },
  optionName: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  choices: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: space.x3,
  },
  choice: {
    minHeight: size.row,
    paddingInline: space.x4,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '1px',
  },
  choiceOn: {
    borderColor: color.accent,
    backgroundColor: { default: color.selected, ':hover': color.selected },
    fontWeight: text.strong,
  },
  pair: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: space.x4,
  },
});

function memberName(bots: readonly BotSummary[], slug: string): string {
  return bots.find((bot) => bot.slug === slug)?.displayName ?? slug;
}

function BellIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.6 6.2a4.4 4.4 0 0 1 8.8 0v2.1c0 .8.3 1.5.8 2.1l.8 1H2l.8-1c.5-.6.8-1.3.8-2.1V6.2ZM6.5 13.2a1.5 1.5 0 0 0 3 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InviteMemberModal({
  group,
  bots,
  actions,
  t,
  onClose,
}: {
  group: ChannelSummary;
  bots: readonly BotSummary[];
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose: () => void;
}): ReactElement {
  const { query, delayedQuery, updateQuery, cancelOnUnmount } = useDelayedSearch(250, (value) =>
    value.trim().toLocaleLowerCase(),
  );
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const available = bots.filter(
    (bot) =>
      !bot.paused &&
      !bot.deleted &&
      !group.members.includes(bot.slug) &&
      !group.invitations?.some(
        (invitation) => invitation.targetBotSlug === bot.slug && invitation.status === 'pending',
      ),
  );
  const filtered = available.filter(
    (bot) =>
      bot.displayName.toLocaleLowerCase().includes(delayedQuery) ||
      bot.slug.toLocaleLowerCase().includes(delayedQuery),
  );
  const invite = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    try {
      if (await actions.inviteGroupBot(group.id, selected)) onClose();
      else setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormDialog
      title={t('group.invite')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('group.invite')}
      submitDisabled={!selected}
      busy={busy}
      error={error ? t('members.error') : undefined}
      onCancel={onClose}
      onSubmit={() => void invite()}
    >
      <TextField
        label={t('group.inviteSearch')}
        data-group-invite-search=""
        value={query}
        placeholder={t('group.inviteSearch')}
        onChange={updateQuery}
        initialFocus
      />
      <div
        ref={cancelOnUnmount}
        role="group"
        aria-label={t('group.inviteSelect')}
        data-group-invite=""
        {...stylex.props(styles.results)}
      >
        {filtered.length === 0 ? (
          <Note>{t('group.inviteEmpty')}</Note>
        ) : (
          filtered.map((bot) => (
            <button
              type="button"
              key={bot.slug}
              data-group-invite-option={bot.slug}
              aria-pressed={selected === bot.slug}
              onClick={() => setSelected(bot.slug)}
              {...stylex.props(styles.option, selected === bot.slug && styles.optionOn)}
            >
              <PersonaBotAvatar
                t={t}
                personaBotId={bot.slug}
                name={bot.displayName}
                src={bot.avatar}
                appearance={bot.appearance}
                avatarSeed={bot.avatarSeed}
                size={28}
              />
              <span {...stylex.props(styles.optionName)}>{bot.displayName}</span>
            </button>
          ))
        )}
      </div>
    </FormDialog>
  );
}

function GroupAttentionModal({
  group,
  bots,
  actions,
  t,
  onClose,
}: {
  group: ChannelSummary;
  bots: readonly BotSummary[];
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const invitationLabels = {
    pending: t('members.pending'),
    accepted: t('members.accepted'),
    declined: t('members.declined'),
    cancelled: t('members.cancelled'),
  };
  const apply = async (result: Promise<boolean>): Promise<void> => {
    setBusy(true);
    try {
      setError(!(await result));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PanelDialog
      size="small"
      scroll
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('members.attention.title')}
      data={{ 'data-group-attention': '' }}
    >
      <h3 {...stylex.props(styles.attentionHeading)}>{t('members.invites')}</h3>
      {group.invitations?.length ? (
        group.invitations.map((invitation) => (
          <div
            data-group-attention-item=""
            {...stylex.props(styles.attentionItem)}
            key={invitation.id}
          >
            <PersonaBotAvatar
              t={t}
              personaBotId={invitation.targetBotSlug}
              name={memberName(bots, invitation.targetBotSlug)}
              src={bots.find((bot) => bot.slug === invitation.targetBotSlug)?.avatar}
              size={28}
            />
            <span {...stylex.props(styles.attentionName)}>
              {memberName(bots, invitation.targetBotSlug)}
            </span>
            <Tag tone="neutral">{invitationLabels[invitation.status]}</Tag>
            {invitation.status === 'pending' ? (
              <button
                type="button"
                className="bh-group-manage-button"
                disabled={busy}
                onClick={() => void apply(actions.cancelGroupInvitation(group.id, invitation.id))}
              >
                {t('members.cancel')}
              </button>
            ) : null}
          </div>
        ))
      ) : (
        <Note>{t('members.attention.emptyInvites')}</Note>
      )}
      <h3 {...stylex.props(styles.attentionHeading)}>{t('members.joinRequests')}</h3>
      {group.joinRequests?.length ? (
        group.joinRequests.map((request) => (
          <div
            data-group-attention-item=""
            {...stylex.props(styles.attentionItem)}
            key={request.id}
          >
            <PersonaBotAvatar
              t={t}
              personaBotId={request.requesterBotSlug}
              name={memberName(bots, request.requesterBotSlug)}
              src={bots.find((bot) => bot.slug === request.requesterBotSlug)?.avatar}
              size={28}
            />
            <span {...stylex.props(styles.attentionName)}>
              {memberName(bots, request.requesterBotSlug)}
            </span>
            <Tag tone="neutral">
              {request.status === 'pending'
                ? t('members.joinPending')
                : invitationLabels[request.status]}
            </Tag>
            {request.status === 'pending' ? (
              <span {...stylex.props(styles.attentionActions)}>
                <button
                  type="button"
                  className="bh-group-manage-button"
                  disabled={busy}
                  onClick={() => void apply(actions.decideGroupJoin(group.id, request.id, true))}
                >
                  {t('members.approve')}
                </button>
                <button
                  type="button"
                  className="bh-group-manage-button"
                  disabled={busy}
                  onClick={() => void apply(actions.decideGroupJoin(group.id, request.id, false))}
                >
                  {t('members.reject')}
                </button>
              </span>
            ) : null}
          </div>
        ))
      ) : (
        <Note>{t('members.attention.emptyRequests')}</Note>
      )}
      {error ? <Note tone="danger">{t('members.error')}</Note> : null}
    </PanelDialog>
  );
}

export function MembersHeaderAction(props: ChannelSidebarEntryProps): ReactElement {
  return <MembersHeaderActionForChannel key={props.channelId} {...props} />;
}

function MembersHeaderActionForChannel({
  channelId,
  actions,
  t,
}: ChannelSidebarEntryProps): ReactElement {
  const state = useClientState();
  const group = state.conversation.channel;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  if (group?.id !== channelId || group.type !== 'group') return <></>;
  const pending =
    (group.invitations?.filter((item) => item.status === 'pending').length ?? 0) +
    (group.joinRequests?.filter((item) => item.status === 'pending').length ?? 0);
  return (
    <>
      <Tooltip label={t('group.invite')} side="bottom" delayMs={500}>
        <IconButton
          size="row"
          tone="subtle"
          aria-label={t('group.invite')}
          aria-haspopup="dialog"
          onClick={() => setInviteOpen(true)}
        >
          <IconPlusOutlineRegular size={16} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('members.attention.title')} side="bottom" delayMs={500}>
        <IconButton
          size="row"
          tone="subtle"
          aria-label={t('members.attention.label', { count: pending })}
          aria-haspopup="dialog"
          onClick={() => setAttentionOpen(true)}
        >
          <BellIcon />
          {pending > 0 ? (
            <span className="bh-group-attention-badge" aria-hidden="true">
              {pending > 99 ? '99+' : pending}
            </span>
          ) : null}
        </IconButton>
      </Tooltip>
      {inviteOpen ? (
        <InviteMemberModal
          group={group}
          bots={state.bots}
          actions={actions}
          t={t}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}
      {attentionOpen ? (
        <GroupAttentionModal
          group={group}
          bots={state.bots}
          actions={actions}
          t={t}
          onClose={() => setAttentionOpen(false)}
        />
      ) : null}
    </>
  );
}

export function MemberWakePolicyModal({
  group,
  slug,
  name,
  actions,
  t,
  onClose,
}: {
  group: ChannelSummary;
  slug: string;
  name: string;
  actions: Pick<BridgeActions, 'setGroupWakePolicy'>;
  t: BotHarnessTranslate;
  onClose: () => void;
}): ReactElement {
  const saved = group.wakePolicies?.[slug];
  const [mode, setMode] = useState<'all' | 'mentions' | 'digest' | 'silent'>(
    saved?.mode ?? 'digest',
  );
  const [count, setCount] = useState(saved?.count ?? 5);
  const [seconds, setSeconds] = useState(saved?.intervalSeconds ?? 30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const valid =
    Number.isSafeInteger(count) &&
    count >= 1 &&
    count <= 100 &&
    Number.isSafeInteger(seconds) &&
    seconds >= 1 &&
    seconds <= 3600;
  const save = async (inherit = false): Promise<void> => {
    setBusy(true);
    try {
      if (
        await actions.setGroupWakePolicy(group.id, slug, {
          mode: inherit ? (saved?.mode ?? 'digest') : mode,
          count: inherit ? (saved?.count ?? 5) : count,
          intervalSeconds: inherit ? (saved?.intervalSeconds ?? 30) : seconds,
          ...(inherit ? { inherit } : {}),
        })
      )
        onClose();
      else setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormDialog
      title={t('members.policy.title', { bot: name })}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('members.wake.save')}
      submitDisabled={!valid}
      busy={busy}
      error={error ? t('members.error') : undefined}
      onCancel={onClose}
      onSubmit={() => void save()}
      secondary={
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(true)}>
          {t('defaults.restore')}
        </Button>
      }
    >
      <Field label={t('members.wake')} group>
        {() => (
          <div {...stylex.props(styles.choices)}>
            {(['all', 'mentions', 'digest', 'silent'] as const).map((option) => (
              <button
                type="button"
                key={option}
                data-member-wake-mode={option}
                aria-pressed={mode === option}
                onClick={() => setMode(option)}
                {...stylex.props(styles.choice, mode === option && styles.choiceOn)}
              >
                {t(`members.wake.${option}`)}
              </button>
            ))}
          </div>
        )}
      </Field>
      {mode === 'digest' ? (
        <div {...stylex.props(styles.pair)}>
          <TextField
            label={t('members.wake.count')}
            type="number"
            min={1}
            max={100}
            value={String(count)}
            onChange={(value) => setCount(Number(value))}
          />
          <TextField
            label={t('members.wake.seconds')}
            type="number"
            min={1}
            max={3600}
            value={String(seconds)}
            onChange={(value) => setSeconds(Number(value))}
          />
        </div>
      ) : null}
    </FormDialog>
  );
}

export function MembersEntry(props: ChannelSidebarEntryProps): ReactElement {
  return <MembersEntryForChannel key={props.channelId} {...props} />;
}

function MembersEntryForChannel({ actions, t, channelId }: ChannelSidebarEntryProps): ReactElement {
  const state = useClientState();
  const channel = state.conversation.channel;
  const group = channel?.type === 'group' && channel.id === channelId ? channel : undefined;
  const [menu, setMenu] = useState<{ slug: string; x: number; y: number } | undefined>();
  const [policySlug, setPolicySlug] = useState<string | undefined>();
  const [error, setError] = useState(false);
  const proxy = useRef<HTMLSpanElement | null>(null);
  const members = group?.members ?? [];
  const menuItems: readonly MenuEntry[] = [
    { id: 'dm', label: t('members.openDm') },
    { id: 'policy', label: t('members.policy') },
    { type: 'separator', id: 'member-separator' },
    { id: 'remove', label: t('members.remove') },
  ];
  const selectedMember = menu?.slug;
  return (
    <>
      {group?.ownerBotSlug === undefined && group !== undefined ? (
        <div className="bh-note">{t('members.humanManaged')}</div>
      ) : null}
      {members.length === 0 ? <div className="bh-note">{t('members.empty')}</div> : null}
      {(group?.humanMembers ?? []).map((member) => (
        <div
          className="bh-member-row"
          key={'human:' + member.humanId}
          data-human-id={member.humanId}
        >
          <span className="bh-delivery-human-avatar" aria-hidden="true">
            {humanLabel(member.displayName, t).slice(0, 1)}
          </span>
          <span className="bh-name">{humanLabel(member.displayName, t)}</span>
          {member.displayName === 'Human' ? null : (
            <Tag tone="neutral">{t('message.mention.humanType')}</Tag>
          )}
        </div>
      ))}
      {members.map((slug) => {
        const member = state.bots.find((candidate) => candidate.slug === slug);
        return (
          <div
            className="bh-member-row"
            key={slug}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ slug, x: event.clientX, y: event.clientY });
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              setMenu({ slug, x: rect.right - 20, y: rect.bottom });
            }}
          >
            <button
              type="button"
              className="bh-member-open-dm"
              aria-label={t('message.mention.openDm', { bot: memberName(state.bots, slug) })}
              onClick={() => void actions.openBot(slug)}
            >
              <PersonaBotAvatar
                t={t}
                personaBotId={slug}
                name={member?.displayName ?? slug}
                src={member?.avatar}
                appearance={member?.appearance}
                avatarSeed={member?.avatarSeed}
                state={member === undefined ? 'idle' : personaBotActivity(state, member)}
                size={26}
              />
              <span className="bh-name">{memberName(state.bots, slug)}</span>
            </button>
            <Tag tone="neutral">{t('message.mention.botType')}</Tag>
            {group?.ownerBotSlug === slug ? <Tag tone="neutral">{t('members.owner')}</Tag> : null}
            <button
              type="button"
              className="bh-member-menu-button"
              aria-label={t('members.menu', { bot: memberName(state.bots, slug) })}
              aria-haspopup="menu"
              aria-expanded={menu?.slug === slug}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setMenu({ slug, x: rect.left, y: rect.bottom });
              }}
            >
              <IconEllipsisOutlineRegular size={16} />
            </button>
          </div>
        );
      })}
      {group && selectedMember ? (
        <span className="bh-menu-anchor" style={{ left: menu.x, top: menu.y }}>
          <Menu
            open
            portal
            dense
            autoFocus
            anchor={<span ref={proxy} aria-hidden="true" />}
            getAnchorRect={() => proxy.current?.getBoundingClientRect() ?? null}
            items={menuItems}
            onSelect={(id) => {
              setMenu(undefined);
              if (id === 'dm') void actions.openBot(selectedMember);
              else if (id === 'policy') setPolicySlug(selectedMember);
              else if (
                id === 'remove' &&
                window.confirm(
                  t('members.removeConfirm', { bot: memberName(state.bots, selectedMember) }),
                )
              ) {
                void actions
                  .removeGroupMember(group.id, selectedMember)
                  .then((ok) => setError(!ok));
              }
            }}
            onClose={() => setMenu(undefined)}
          />
        </span>
      ) : null}
      {group && policySlug && members.includes(policySlug) ? (
        <MemberWakePolicyModal
          key={`${group.id}:${policySlug}:${group.wakePolicies?.[policySlug]?.revision ?? 0}`}
          group={group}
          slug={policySlug}
          name={memberName(state.bots, policySlug)}
          actions={actions}
          t={t}
          onClose={() => setPolicySlug(undefined)}
        />
      ) : null}
      {error ? (
        <div className="bh-error" role="alert">
          {t('members.error')}
        </div>
      ) : null}
    </>
  );
}
