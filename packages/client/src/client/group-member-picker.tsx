import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type {
  GroupMemberOutcome,
  GroupMemberPickerResult,
  GroupMemberTarget,
} from '@botharness/host-protocol/group-members';
import type { BridgeCall } from './bridge.js';
import { useDelayedSearch } from './delayed-search.js';
import { Checkbox } from './ds/checkbox.js';
import { TextField } from './ds/field.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import { ink, space, style } from './ds/tobs.stylex.js';
import { addGroupMembers, groupMemberKey, loadGroupMemberPicker } from './group-member-bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  picker: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    overflowY: 'auto',
    maxHeight: `calc(${style.controlHeight} * 8)`,
    minWidth: 0,
    padding: space.x2,
  },
  group: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
  heading: {
    color: ink.secondary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    margin: 0,
  },
  row: { overflowWrap: 'anywhere' },
  outcomes: { margin: 0, paddingInlineStart: space.x4, overflowWrap: 'anywhere' },
});

export interface PickedGroupMember {
  kind: GroupMemberTarget['kind'];
  id: string;
  displayName: string;
  username?: string;
  requiresOwner?: true;
  requiredHumanId?: string;
}

function needsOwner(row: PickedGroupMember, keys: ReadonlySet<string>): boolean {
  return (
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
}: {
  call: BridgeCall;
  channelId?: string | undefined;
  selected: readonly PickedGroupMember[];
  onChange: (selected: PickedGroupMember[]) => void;
  disabled: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const { query, delayedQuery, updateQuery, cancelOnUnmount } = useDelayedSearch(250, (value) =>
    value.trim(),
  );
  const [response, setResponse] = useState<
    { query: string; value: GroupMemberPickerResult } | { query: string; failed: true }
  >();
  const [attempt, setAttempt] = useState(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    void loadGroupMemberPicker(call, channelId, delayedQuery, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setResponse({ query: delayedQuery, value });
      },
      () => {
        if (!controller.signal.aborted) setResponse({ query: delayedQuery, failed: true });
      },
    );
    return () => controller.abort();
  }, [call, channelId, delayedQuery, attempt]);
  const current = response?.query === query.trim() ? response : undefined;
  const candidates = current && 'value' in current ? current.value : undefined;
  const keys = new Set(selected.map(groupMemberKey));
  const people: PickedGroupMember[] =
    candidates?.people.map((person) => ({ ...person, kind: 'human' })) ?? [];
  const bots: PickedGroupMember[] = candidates?.bots.map((bot) => ({ ...bot, kind: 'bot' })) ?? [];
  const visible = new Set([...people, ...bots].map(groupMemberKey));
  const outsideSearch = selected.filter((member) => !visible.has(groupMemberKey(member)));
  const selection = (row: PickedGroupMember) => (
    <Checkbox
      key={groupMemberKey(row)}
      className={stylex.props(styles.row).className}
      checked={keys.has(groupMemberKey(row))}
      disabled={
        disabled ||
        (!keys.has(groupMemberKey(row)) && (needsOwner(row, keys) || selected.length >= 100))
      }
      label={
        <span>
          {row.displayName}
          {row.username === undefined ? '' : ' @' + row.username}
          {needsOwner(row, keys) ? ' · ' + t('groupMembers.requiresOwner') : ''}
        </span>
      }
      onChange={(checked) =>
        onChange(
          checked
            ? [...selected, row]
            : selected.filter((item) => groupMemberKey(item) !== groupMemberKey(row)),
        )
      }
    />
  );
  return (
    <div ref={cancelOnUnmount} {...stylex.props(styles.picker)}>
      <TextField
        label={t('groupMembers.search')}
        placeholder={t('groupMembers.search')}
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
          <div
            role="group"
            aria-label={t('groupMembers.selected', { count: selected.length })}
            {...stylex.props(styles.group)}
          >
            <p {...stylex.props(styles.heading)}>
              {t('groupMembers.selected', { count: selected.length })}
            </p>
            {outsideSearch.map(selection)}
          </div>
        ) : null}
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
        {candidates ? (
          <>
            {candidates.canAddPeople && people.length > 0 ? (
              <div
                role="group"
                aria-label={t('groupMembers.people')}
                {...stylex.props(styles.group)}
              >
                <p {...stylex.props(styles.heading)}>{t('groupMembers.people')}</p>
                {people.map(selection)}
              </div>
            ) : null}
            {candidates.canAddBots && bots.length > 0 ? (
              <div role="group" aria-label={t('groupMembers.bots')} {...stylex.props(styles.group)}>
                {candidates.canAddPeople ? (
                  <p {...stylex.props(styles.heading)}>{t('groupMembers.bots')}</p>
                ) : null}
                {bots.map(selection)}
              </div>
            ) : null}
            {people.length === 0 && bots.length === 0 ? (
              <Note>{t('groupMembers.empty')}</Note>
            ) : null}
          </>
        ) : null}
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
        ? { member: item.member, target: memberTarget(item.member) }
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
