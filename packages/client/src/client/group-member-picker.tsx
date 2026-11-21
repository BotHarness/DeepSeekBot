import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type {
  GroupMemberOutcome,
  GroupMemberPickerResult,
  GroupMemberTarget,
} from '@botharness/host-protocol/group-members';
import type { BridgeCall } from './bridge.js';
import { useDelayedSearch } from './delayed-search.js';
import { Button } from './ds/button.js';
import { Checkbox } from './ds/checkbox.js';
import { TextField } from './ds/field.js';
import { Note } from './ds/note.js';
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
  const mount = useMountedResource<HTMLDivElement>(
    (node) => {
      cancelOnUnmount(node);
      const controller = new AbortController();
      void loadGroupMemberPicker(call, channelId, delayedQuery, controller.signal).then(
        (value) => {
          if (!controller.signal.aborted) setResponse({ query: delayedQuery, value });
        },
        () => {
          if (!controller.signal.aborted) setResponse({ query: delayedQuery, failed: true });
        },
      );
      return () => {
        controller.abort();
        cancelOnUnmount(null);
      };
    },
    [call, channelId, delayedQuery, attempt],
  );
  const answer = response && 'value' in response ? response.value : undefined;
  const keys = new Set(selected.map(groupMemberKey));
  const people: PickedGroupMember[] =
    answer?.people.map((person) => ({ ...person, kind: 'human' })) ?? [];
  const bots: PickedGroupMember[] = answer?.bots.map((bot) => ({ ...bot, kind: 'bot' })) ?? [];
  const remaining = (rows: PickedGroupMember[]) =>
    rows.filter((row) => !keys.has(groupMemberKey(row)));
  const requiresOwner = (row: PickedGroupMember) =>
    row.requiresOwner === true &&
    (row.requiredHumanId === undefined || !keys.has('human:' + row.requiredHumanId));
  const selection = (row: PickedGroupMember, selectedRow: boolean) => (
    <Checkbox
      key={groupMemberKey(row)}
      className={stylex.props(styles.row).className}
      checked={selectedRow}
      disabled={disabled || (!selectedRow && (requiresOwner(row) || selected.length >= 100))}
      label={
        <span>
          {row.displayName}
          {row.username === undefined ? '' : ' @' + row.username}
          {requiresOwner(row) ? ' · ' + t('groupMembers.requiresOwner') : ''}
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
  const candidates =
    response?.query === delayedQuery && query.trim() === delayedQuery ? answer : undefined;
  return (
    <div {...stylex.props(styles.picker)}>
      <TextField
        label={t('groupMembers.search')}
        placeholder={t('groupMembers.search')}
        value={query}
        onChange={updateQuery}
        disabled={disabled}
        maxLength={200}
      />
      <div
        ref={mount}
        aria-busy={response?.query !== delayedQuery}
        {...stylex.props(styles.results)}
      >
        {selected.length > 0 ? (
          <div
            role="group"
            aria-label={t('groupMembers.selected', { count: selected.length })}
            {...stylex.props(styles.group)}
          >
            <p {...stylex.props(styles.heading)}>
              {t('groupMembers.selected', { count: selected.length })}
            </p>
            {selected.map((row) => selection(row, true))}
          </div>
        ) : null}
        {response && 'failed' in response && response.query === delayedQuery ? (
          <div>
            <Note tone="danger">{t('groupMembers.loadFailed')}</Note>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setResponse(undefined);
                setAttempt((current) => current + 1);
              }}
            >
              {t('groupMembers.retry')}
            </Button>
          </div>
        ) : null}
        {candidates ? (
          <>
            {candidates.canAddPeople && remaining(people).length > 0 ? (
              <div
                role="group"
                aria-label={t('groupMembers.people')}
                {...stylex.props(styles.group)}
              >
                <p {...stylex.props(styles.heading)}>{t('groupMembers.people')}</p>
                {remaining(people).map((row) => selection(row, false))}
              </div>
            ) : null}
            {candidates.canAddBots && remaining(bots).length > 0 ? (
              <div role="group" aria-label={t('groupMembers.bots')} {...stylex.props(styles.group)}>
                {candidates.canAddPeople ? (
                  <p {...stylex.props(styles.heading)}>{t('groupMembers.bots')}</p>
                ) : null}
                {remaining(bots).map((row) => selection(row, false))}
              </div>
            ) : null}
            {remaining(people).length === 0 && remaining(bots).length === 0 ? (
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
  return member.kind === 'human'
    ? { kind: 'human', id: member.id }
    : { kind: 'bot', id: member.id, operationKey: crypto.randomUUID() };
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
