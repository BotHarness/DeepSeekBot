import { useRef, useState, type ReactElement } from 'react';
import { shallowEqual } from '@deepseek-ai/dsh-client-store';
import { HUMAN_AVATAR_BATCH, readHumanAvatars } from '@botharness/host-client/human-profile';
import * as stylex from '@stylexjs/stylex';
import {
  GROUP_MEMBER_UNCONFIRMED,
  type GroupBotCandidate,
  type GroupHumanCandidate,
  type GroupMemberOutcome,
  type GroupMemberPickerResult,
  type GroupMemberTarget,
} from '@botharness/host-protocol/group-members';
import { bridgeHost, type BridgeCall } from './bridge.js';
import { PersonaBotAvatar } from './avatar.js';
import { useClientStore } from './use-client-store.js';
import { useDelayedSearch } from './delayed-search.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { TextField } from './ds/field.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import { accent, edge, ink, radius, size, space, style } from './ds/tobs.stylex.js';
import { addGroupMembers, groupMemberKey, loadGroupMemberPicker } from './group-member-bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  picker: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    overflowY: 'auto',
    maxHeight: `calc(${style.controlHeight} * 8)`,
    minWidth: 0,
    padding: space.x2,
  },
  heading: {
    color: ink.secondary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    margin: 0,
  },
  row: {
    width: '100%',
    minHeight: size.rowLarge,
    height: 'auto',
    justifyContent: 'flex-start',
    gap: space.x3,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    textAlign: 'start',
    whiteSpace: 'normal',
    outlineOffset: `calc(-1 * ${edge.focusOffset})`,
  },
  rowSelected: {
    backgroundColor: {
      default: style.choiceSelectedFill,
      ':hover:enabled': style.choiceSelectedFill,
    },
    color: style.choiceSelectedInk,
  },
  portrait: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size.row,
    height: size.row,
    flexShrink: 0,
  },
  humanPortrait: {
    borderRadius: radius.full,
    overflow: 'hidden',
    backgroundColor: accent.container,
    color: accent.onContainer,
  },
  photo: { width: '100%', height: '100%', objectFit: 'cover' },
  identity: { flex: 1, minWidth: 0, overflowWrap: 'anywhere' },
  name: { display: 'inline-flex', alignItems: 'center', gap: space.x1, maxWidth: '100%' },
  detail: { display: 'block', color: ink.secondary, fontWeight: 400 },
  kind: { display: 'inline-flex', flexShrink: 0, color: ink.secondary },
  mark: {
    display: 'inline-flex',
    justifyContent: 'center',
    minWidth: size.icon,
    flexShrink: 0,
    color: accent.ink,
  },
  outcomes: { margin: 0, paddingInlineStart: space.x4, overflowWrap: 'anywhere' },
});

export type PickedGroupMember =
  | (GroupHumanCandidate & { kind: 'human' })
  | (GroupBotCandidate & { kind: 'bot' });

const portraitSize = Number.parseInt(size.row, 10);

export type GroupBotPortrait = (bot: GroupBotCandidate, size: number) => ReactElement;

function LocalBotPortrait({ bot }: { bot: GroupBotCandidate }): ReactElement {
  const face = useClientStore((state) => {
    const entry = state.bots.find((item) => item.slug === bot.id);
    return { avatar: entry?.avatar, appearance: entry?.appearance, avatarSeed: entry?.avatarSeed };
  }, shallowEqual);
  return (
    <PersonaBotAvatar
      personaBotId={bot.id}
      name={bot.displayName}
      size={portraitSize}
      src={face.avatar}
      appearance={face.appearance}
      avatarSeed={face.avatarSeed}
      preview
      still
      indicator={false}
      nativeTitle={false}
    />
  );
}

function candidateSearch(query: string, t: BotHarnessTranslate) {
  const separator = query.indexOf(':');
  const term = (separator === -1 ? query : query.slice(0, separator)).trim().toLowerCase();
  const kind = [
    'human',
    'team member',
    '团队成员',
    t('groupMembers.typeHuman').toLowerCase(),
  ].includes(term)
    ? 'human'
    : term === 'bot'
      ? 'bot'
      : undefined;
  const name =
    kind === undefined ? query : separator === -1 ? '' : query.slice(separator + 1).trim();
  return { kind, name: name.replace(/^@/u, '') };
}

function needsOwner(row: PickedGroupMember, keys: ReadonlySet<string>): boolean {
  return (
    row.kind === 'bot' &&
    row.requiresOwner === true &&
    (row.requiredHumanId === undefined || !keys.has('human:' + row.requiredHumanId))
  );
}

export function groupSelectionNeedsOwner(selected: readonly PickedGroupMember[]): boolean {
  const keys = new Set(selected.map(groupMemberKey));
  return selected.some((row) => needsOwner(row, keys));
}

export function GroupMemberPicker({
  call,
  channelId,
  selected,
  onChange,
  disabled,
  t,
  botPortrait,
}: {
  call: BridgeCall;
  channelId?: string | undefined;
  selected: readonly PickedGroupMember[];
  onChange: (selected: PickedGroupMember[]) => void;
  disabled: boolean;
  t: BotHarnessTranslate;
  botPortrait?: GroupBotPortrait | undefined;
}): ReactElement {
  const { query, delayedQuery, updateQuery, cancelOnUnmount } = useDelayedSearch(250, (value) =>
    value.trim(),
  );
  const [response, setResponse] = useState<
    { call: BridgeCall; channelId: string | undefined; query: string } & (
      | { value: GroupMemberPickerResult }
      | { failed: true }
    )
  >();
  const [attempt, setAttempt] = useState(0);
  const [photos, setPhotos] = useState<{ call: BridgeCall; images: Map<string, string> }>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    const request = { call, channelId, query: delayedQuery };
    const search = candidateSearch(delayedQuery, t);
    void loadGroupMemberPicker(call, channelId, search.name, controller.signal).then(
      (value) => {
        if (controller.signal.aborted) return;
        setResponse({ ...request, value });
        if (search.kind === 'bot' || !value.canAddPeople || value.people.length === 0) return;
        const ids = value.people.map((person) => person.id);
        const host = bridgeHost(call, controller.signal);
        const batches = [];
        for (let index = 0; index < ids.length; index += HUMAN_AVATAR_BATCH)
          batches.push(readHumanAvatars(host, ids.slice(index, index + HUMAN_AVATAR_BATCH)));
        void Promise.allSettled(batches).then((results) => {
          if (controller.signal.aborted) return;
          setPhotos((previous) => {
            const images = new Map(previous?.call === call ? previous.images : undefined);
            for (const result of results) {
              if (result.status === 'fulfilled')
                for (const photo of result.value) images.set(photo.humanId, photo.avatar);
            }
            return { call, images: new Map([...images].slice(-128)) };
          });
        });
      },
      () => {
        if (!controller.signal.aborted) setResponse({ ...request, failed: true });
      },
    );
    return () => controller.abort();
  }, [call, channelId, delayedQuery, attempt, t]);
  const current =
    response?.call === call && response.channelId === channelId && response.query === query.trim()
      ? response
      : undefined;
  const candidates = current && 'value' in current ? current.value : undefined;
  const keys = new Set(selected.map(groupMemberKey));
  const { kind } = candidateSearch(query.trim(), t);
  const people: PickedGroupMember[] =
    candidates?.canAddPeople && kind !== 'bot'
      ? candidates.people.map((person) => ({ ...person, kind: 'human' }))
      : [];
  const bots: PickedGroupMember[] =
    candidates?.canAddBots && kind !== 'human'
      ? candidates.bots.map((bot) => ({ ...bot, kind: 'bot' }))
      : [];
  const matching = [...people, ...bots].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const visible = new Set(matching.map(groupMemberKey));
  const outsideSearch = selected.filter((member) => !visible.has(groupMemberKey(member)));
  const selection = (row: PickedGroupMember) => {
    const key = groupMemberKey(row);
    const pressed = keys.has(key);
    const ownerNeeded = needsOwner(row, keys);
    const kindLabel = t(row.kind === 'human' ? 'groupMembers.typeHuman' : 'groupMembers.typeBot');
    const handle = row.kind === 'human' ? row.username : undefined;
    const identity = [row.displayName, kindLabel, handle && '@' + handle]
      .filter(Boolean)
      .join(' · ');
    const photo =
      row.kind === 'human' && photos?.call === call ? photos.images.get(row.id) : undefined;
    return (
      <Button
        key={key}
        type="button"
        aria-label={ownerNeeded ? identity + ' · ' + t('groupMembers.requiresOwner') : identity}
        aria-pressed={pressed}
        disabled={disabled || (!pressed && (ownerNeeded || selected.length >= 100))}
        xstyle={[styles.row, pressed && styles.rowSelected]}
        onClick={() =>
          onChange(
            pressed ? selected.filter((item) => groupMemberKey(item) !== key) : [...selected, row],
          )
        }
      >
        <span
          aria-hidden="true"
          {...stylex.props(styles.portrait, row.kind === 'human' && styles.humanPortrait)}
        >
          {row.kind === 'bot' ? (
            (botPortrait?.(row, portraitSize) ?? <LocalBotPortrait bot={row} />)
          ) : photo ? (
            <img src={photo} alt="" draggable={false} {...stylex.props(styles.photo)} />
          ) : (
            Array.from(row.displayName.trim())[0]?.toUpperCase()
          )}
        </span>
        <span {...stylex.props(styles.identity)}>
          <span {...stylex.props(styles.name)}>
            <span>{row.displayName}</span>
            <span title={kindLabel} aria-hidden="true" {...stylex.props(styles.kind)}>
              <Icon name={row.kind === 'human' ? 'user' : 'bot'} />
            </span>
          </span>
          {handle ? <span {...stylex.props(styles.detail)}>@{handle}</span> : null}
          {ownerNeeded ? (
            <span {...stylex.props(styles.detail)}>{t('groupMembers.requiresOwner')}</span>
          ) : null}
        </span>
        <span aria-hidden="true" {...stylex.props(styles.mark)}>
          {pressed ? <Icon name="check" /> : null}
        </span>
      </Button>
    );
  };
  return (
    <div ref={cancelOnUnmount} {...stylex.props(styles.picker)}>
      <TextField
        label={t('groupMembers.search')}
        placeholder={t('groupMembers.searchHint')}
        value={query}
        onChange={updateQuery}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault();
        }}
        disabled={disabled}
        maxLength={200}
      />
      <div ref={mount} aria-busy={current === undefined} {...stylex.props(styles.results)}>
        {selected.length > 0 ? (
          <p aria-live="polite" {...stylex.props(styles.heading)}>
            {t('groupMembers.selected', { count: selected.length })}
          </p>
        ) : null}
        {outsideSearch.map(selection)}
        {current && 'failed' in current ? (
          <ReadFailure
            disabled={disabled}
            retryLabel={t('groupMembers.retry')}
            onRetry={() => {
              setResponse(undefined);
              setAttempt((current) => current + 1);
            }}
          >
            {t('groupMembers.loadFailed')}
          </ReadFailure>
        ) : null}
        {matching.map(selection)}
        {candidates && matching.length === 0 ? <Note>{t('groupMembers.empty')}</Note> : null}
      </div>
      {channelId !== undefined && selected.some((row) => row.kind === 'human') ? (
        <Note>{t('groupMembers.history')}</Note>
      ) : null}
    </div>
  );
}

type BatchItem = {
  member: PickedGroupMember;
  target: GroupMemberTarget;
  outcome?: GroupMemberOutcome;
};

function memberTarget(member: PickedGroupMember): GroupMemberTarget {
  return { kind: member.kind, id: member.id, operationKey: crypto.randomUUID() };
}

export function useGroupMemberBatch() {
  const attempt = useRef<BatchItem[]>();
  const [items, setItems] = useState<BatchItem[]>();
  const apply = async (
    call: BridgeCall,
    channelId: string,
    selected: readonly PickedGroupMember[],
  ) => {
    const batch = (
      attempt.current ??
      selected.map((member): BatchItem => ({ member, target: memberTarget(member) }))
    ).map((item) =>
      item.outcome?.status === 'failed'
        ? {
            member: item.member,
            target:
              item.outcome.code === GROUP_MEMBER_UNCONFIRMED
                ? item.target
                : memberTarget(item.member),
          }
        : item,
    );
    attempt.current = batch;
    setItems(batch);
    const targets = batch.filter((item) => item.outcome === undefined).map((item) => item.target);
    const results = await addGroupMembers(call, channelId, targets);
    attempt.current = batch.map((item) => {
      const outcome = results.get(groupMemberKey(item.target));
      return outcome === undefined ? item : { ...item, outcome };
    });
    setItems(attempt.current);
  };
  return {
    items,
    apply,
    complete:
      items?.every(
        (item) => item.outcome?.status === 'joined' || item.outcome?.status === 'pending',
      ) === true,
  };
}

function failureReason(t: BotHarnessTranslate, code: string): string {
  switch (code) {
    case 'bot-principal-channel-denied':
      return t('groupMembers.requiresOwner');
    case 'channel-membership-ended':
      return t('groupMembers.membershipEnded');
    case 'member-not-found':
    case 'bot-not-found':
    case 'bot-principal-inactive':
    case 'bot-channel-join-disabled':
    case 'protected-bot':
      return t('groupMembers.unavailable');
    case 'permission-required':
      return t('groupMembers.denied');
    case 'team-mode-off':
      return t('team.error.teamModeOff');
    case GROUP_MEMBER_UNCONFIRMED:
      return t('groupMembers.unconfirmed');
    default:
      return t('groupMembers.failed');
  }
}

export function GroupMemberResults({
  items,
  busy,
  t,
}: {
  items: readonly BatchItem[];
  busy: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <ul aria-live="polite" {...stylex.props(styles.outcomes)}>
      {items.map(({ member, target, outcome }) => (
        <li key={groupMemberKey(target)}>
          {member.displayName} ·{' '}
          {outcome?.status === 'joined'
            ? t('groupMembers.joined')
            : outcome?.status === 'pending'
              ? t('members.pending')
              : outcome?.status === 'failed'
                ? failureReason(t, outcome.code)
                : t(busy ? 'groupMembers.adding' : 'groupMembers.unconfirmed')}
        </li>
      ))}
    </ul>
  );
}
