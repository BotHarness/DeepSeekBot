import { Icon } from './ds/icon.js';
import { Tag } from './ds/tag.js';
import { Button } from './ds/button.js';
import { PointerMenu } from './ds/pointer-menu.js';
import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { type MenuEntry } from './ds/menu.js';
import { Tooltip } from './ds/tooltip.js';

import type { BridgeActions } from './actions.js';
import { HumanAvatarImage } from './human-avatar.js';
import { PersonaBotAvatar } from './avatar.js';
import { AtSignIcon } from './at-sign-icon.js';
import { useClientStore } from './use-client-store.js';
import { shallowEqual } from '@deepseek-ai/dsh-client-store';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { Field, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import { humanLabel } from './actor-names.js';
import { OWNER_HUMAN_ID, useSelfHumanId } from './self-human.js';
import type { ChannelHumanMember } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import { personaBotActivity } from './persona-activity.js';
import { store, type BotSummary, type ChannelSummary } from './store.js';
import { useSubmission } from './submission.js';
import { IconButton } from './ds/icon-button.js';
import type { BridgeCall } from './bridge.js';
import { loadGroupMemberPicker } from './group-member-bridge.js';
import {
  GroupMemberPicker,
  GroupMemberResults,
  groupSelectionNeedsOwner,
  useGroupMemberBatch,
  type PickedGroupMember,
} from './group-member-picker.js';
import { useMountedResource } from './mounted-resource.js';

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
    outline: {
      default: 'none',
      ':focus-visible': `${border.focus} solid ${color.accent}`,
    },
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

function AddGroupMembersDialog({
  channelId,
  call,
  actions,
  t,
  onClose,
}: {
  channelId: string;
  call: BridgeCall;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose: () => void;
}): ReactElement {
  const showTobGuidance = useClientStore((state) =>
    state.bots.some((bot) => bot.tob !== undefined),
  );
  const [selected, setSelected] = useState<PickedGroupMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const batch = useGroupMemberBatch();
  const apply = async () => {
    if (inFlight.current || (!batch.items && groupSelectionNeedsOwner(selected))) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      await batch.apply(call, channelId, selected);
      void actions.openChannel(channelId, { scopedCall: call }).catch(() => undefined);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };
  return (
    <FormDialog
      title={t('groupMembers.add')}
      labels={{
        close: t('common.close'),
        cancel: t(batch.items ? 'common.close' : 'common.cancel'),
      }}
      submitLabel={t(
        batch.complete
          ? 'common.close'
          : batch.items
            ? 'groupMembers.retry'
            : 'groupMembers.submit',
      )}
      submitDisabled={selected.length === 0 || (!batch.items && groupSelectionNeedsOwner(selected))}
      busy={busy}
      showCancel={!batch.complete}
      scroll
      error={error ? t('groupMembers.unconfirmed') : undefined}
      onCancel={() => {
        if (!inFlight.current) onClose();
      }}
      onSubmit={() => (batch.complete ? onClose() : void apply())}
    >
      {batch.items ? (
        <GroupMemberResults items={batch.items} busy={busy} t={t} />
      ) : (
        <>
          <GroupMemberPicker
            call={call}
            channelId={channelId}
            selected={selected}
            onChange={setSelected}
            disabled={busy}
            t={t}
          />
          {showTobGuidance ? <Note>{t('group.tobPrivateOnly')}</Note> : null}
        </>
      )}
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
  const submission = useSubmission();
  const busy = submission.state === 'busy';
  const invitationLabels = {
    pending: t('members.pending'),
    accepted: t('members.accepted'),
    declined: t('members.declined'),
    cancelled: t('members.cancelled'),
  };
  const apply = async (result: Promise<boolean>): Promise<void> => {
    await submission.run(() => result);
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
              appearance={bots.find((bot) => bot.slug === invitation.targetBotSlug)?.appearance}
              avatarSeed={bots.find((bot) => bot.slug === invitation.targetBotSlug)?.avatarSeed}
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
              appearance={bots.find((bot) => bot.slug === request.requesterBotSlug)?.appearance}
              avatarSeed={bots.find((bot) => bot.slug === request.requesterBotSlug)?.avatarSeed}
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
      {submission.state === 'failed' ? <Note tone="danger">{t('members.error')}</Note> : null}
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
  const group = useClientStore((state) => state.conversation.channel);
  const bots = useClientStore((state) => state.bots, shallowEqual);
  const [inviteCall, setInviteCall] = useState<BridgeCall>();
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [capability, setCapability] = useState<'allowed' | 'denied' | 'failed' | 'retrying'>();
  const [attempt, setAttempt] = useState(0);
  const call = actions.teamCall;
  const discover = useMountedResource<HTMLSpanElement>(() => {
    if (call === undefined) return;
    const controller = new AbortController();
    void loadGroupMemberPicker(call, channelId, '', controller.signal).then(
      (picker) => {
        if (!controller.signal.aborted)
          setCapability(picker.canAddPeople || picker.canAddBots ? 'allowed' : 'denied');
      },
      () => {
        if (!controller.signal.aborted) setCapability('failed');
      },
    );
    return () => controller.abort();
  }, [call, channelId, group?.updatedAt, attempt]);
  if (group?.id !== channelId || group.type !== 'group') return <></>;
  const pending =
    (group.invitations?.filter((item) => item.status === 'pending').length ?? 0) +
    (group.joinRequests?.filter((item) => item.status === 'pending').length ?? 0);
  return (
    <>
      <span ref={discover} hidden />
      {call && capability === 'allowed' ? (
        <Tooltip label={t('groupMembers.add')} side="bottom" delayMs={500}>
          <IconButton
            size="row"
            tone="subtle"
            aria-label={t('groupMembers.add')}
            aria-haspopup="dialog"
            onClick={() => {
              const bound = call.bindConnection ? call.bindConnection() : call;
              if (bound) setInviteCall(() => bound);
              else setCapability('failed');
            }}
          >
            <Icon name="plus" size={16} />
          </IconButton>
        </Tooltip>
      ) : null}
      {call && (capability === 'failed' || capability === 'retrying') ? (
        <Tooltip label={t('groupMembers.retryLoad')} side="bottom" delayMs={500}>
          <IconButton
            size="row"
            tone="subtle"
            aria-label={t('groupMembers.retryLoad')}
            aria-busy={capability === 'retrying'}
            disabled={capability === 'retrying'}
            onClick={() => {
              setCapability('retrying');
              setAttempt((value) => value + 1);
            }}
          >
            <Icon name="refresh-cw" size={16} />
          </IconButton>
        </Tooltip>
      ) : null}
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
      {inviteCall && call ? (
        <AddGroupMembersDialog
          channelId={channelId}
          call={inviteCall}
          actions={actions}
          t={t}
          onClose={() => setInviteCall(undefined)}
        />
      ) : null}
      {attentionOpen ? (
        <GroupAttentionModal
          group={group}
          bots={bots}
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
  const [count, setCount] = useState(saved?.count ?? 10);
  const [seconds, setSeconds] = useState(saved?.intervalSeconds ?? 30);
  const submission = useSubmission();
  const busy = submission.state === 'busy';
  const valid =
    Number.isSafeInteger(count) &&
    count >= 1 &&
    count <= 100 &&
    Number.isSafeInteger(seconds) &&
    seconds >= 1 &&
    seconds <= 3600;
  const save = async (inherit = false): Promise<void> => {
    if (
      await submission.run(() =>
        actions.setGroupWakePolicy(group.id, slug, {
          mode: inherit ? (saved?.mode ?? 'digest') : mode,
          count: inherit ? (saved?.count ?? 10) : count,
          intervalSeconds: inherit ? (saved?.intervalSeconds ?? 30) : seconds,
          ...(inherit ? { inherit } : {}),
        }),
      )
    )
      onClose();
  };
  return (
    <FormDialog
      title={t('members.policy.title', { bot: name })}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('members.wake.save')}
      submitDisabled={!valid}
      busy={submission.state === 'busy'}
      error={submission.state === 'failed' ? t('members.error') : undefined}
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

export function memberHumanName(
  member: Pick<ChannelHumanMember, 'humanId' | 'displayName'>,
  self: string,
  t: BotHarnessTranslate,
): string {
  if (member.humanId === self) return humanLabel(member.displayName, t);
  if (member.humanId === OWNER_HUMAN_ID && member.displayName === 'Human')
    return t('team.members.owner');
  return member.displayName;
}

export function MembersEntry(props: ChannelSidebarEntryProps): ReactElement {
  return <MembersEntryForChannel key={props.channelId} {...props} />;
}

function MembersEntryForChannel({
  actions,
  t,
  channelId,
  onMentionBot,
}: ChannelSidebarEntryProps): ReactElement {
  const channel = useClientStore((state) => state.conversation.channel);
  const bots = useClientStore((state) => state.bots, shallowEqual);
  const group = channel?.type === 'group' && channel.id === channelId ? channel : undefined;
  const [menu, setMenu] = useState<{ slug: string; x: number; y: number } | undefined>();
  const [policySlug, setPolicySlug] = useState<string | undefined>();
  const removal = useSubmission();
  const proxy = useRef<HTMLSpanElement | null>(null);
  const members = group?.members ?? [];
  const humans = group?.humanMembers ?? [];
  const self = useSelfHumanId();
  const selectedMember = menu?.slug;
  const canMention =
    onMentionBot !== undefined &&
    bots.some(
      (bot) => bot.slug === selectedMember && bot.deleted !== true && members.includes(bot.slug),
    );
  const menuItems: readonly MenuEntry[] = [
    {
      id: 'dm',
      label: t('members.openDm'),
      icon: <Icon name="message-square-plus" size={16} />,
    },
    ...(canMention
      ? [
          {
            id: 'mention',
            label: t('message.avatar.mention'),
            icon: <AtSignIcon />,
          },
        ]
      : []),
    { id: 'policy', label: t('members.policy'), icon: <BellIcon /> },
    { type: 'separator', id: 'member-separator' },
    {
      id: 'remove',
      label: t('members.remove'),
      icon: <Icon name="trash" size={16} />,
    },
  ];
  return (
    <>
      {group?.ownerBotSlug === undefined && group !== undefined && self === OWNER_HUMAN_ID ? (
        <div className="bh-note">{t('members.humanManaged')}</div>
      ) : null}
      {members.length === 0 && humans.length === 0 ? (
        <div className="bh-note">{t('members.empty')}</div>
      ) : null}
      {humans.map((member) => {
        const name = memberHumanName(member, self, t);
        return (
          <div
            className="bh-member-row"
            key={'human:' + member.humanId}
            data-human-id={member.humanId}
          >
            <span className="bh-delivery-human-avatar" aria-hidden="true">
              <HumanAvatarImage
                cache={actions.humanAvatars}
                humanId={member.humanId}
                version={member.avatarVersion}
                fallback={name.slice(0, 1)}
              />
            </span>
            <span className="bh-name">{name}</span>
            {member.humanId === self && name !== t('channelActivity.human') ? (
              <Tag tone="neutral">{t('message.mention.humanType')}</Tag>
            ) : null}
          </div>
        );
      })}
      {members.map((slug) => {
        const member = bots.find((candidate) => candidate.slug === slug);
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
              aria-label={t('message.mention.openDm', {
                bot: memberName(bots, slug),
              })}
              onClick={() => void actions.openBot(slug)}
            >
              <PersonaBotAvatar
                t={t}
                personaBotId={slug}
                name={member?.displayName ?? slug}
                src={member?.avatar}
                appearance={member?.appearance}
                avatarSeed={member?.avatarSeed}
                state={
                  member === undefined ? 'idle' : personaBotActivity(store.getSnapshot(), member)
                }
                size={26}
              />
              <span className="bh-name">{memberName(bots, slug)}</span>
            </button>
            <Tag tone="neutral">{t('message.mention.botType')}</Tag>
            {group?.ownerBotSlug === slug ? <Tag tone="neutral">{t('members.owner')}</Tag> : null}
            <button
              type="button"
              className="bh-member-menu-button"
              aria-label={t('members.menu', { bot: memberName(bots, slug) })}
              aria-haspopup="menu"
              aria-expanded={menu?.slug === slug}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setMenu({ slug, x: rect.left, y: rect.bottom });
              }}
            >
              <Icon name="ellipsis" size={16} />
            </button>
          </div>
        );
      })}
      {group && selectedMember ? (
        <span hidden>
          <PointerMenu
            point={menu}
            dense
            autoFocus
            anchor={<span ref={proxy} aria-hidden="true" />}
            items={menuItems}
            onSelect={(id) => {
              setMenu(undefined);
              if (id === 'dm') void actions.openBot(selectedMember);
              else if (id === 'mention' && canMention) onMentionBot?.(selectedMember);
              else if (id === 'policy') setPolicySlug(selectedMember);
              else if (
                id === 'remove' &&
                window.confirm(
                  t('members.removeConfirm', {
                    bot: memberName(bots, selectedMember),
                  }),
                )
              ) {
                void removal.run(() => actions.removeGroupMember(group.id, selectedMember));
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
          name={memberName(bots, policySlug)}
          actions={actions}
          t={t}
          onClose={() => setPolicySlug(undefined)}
        />
      ) : null}
      {removal.state === 'failed' ? (
        <div className="bh-error" role="alert">
          {t('members.error')}
        </div>
      ) : null}
    </>
  );
}
