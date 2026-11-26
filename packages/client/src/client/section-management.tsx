import * as stylex from '@stylexjs/stylex';
import { rosterStyles } from './ds/roster-styles.js';
import { Icon } from './ds/icon.js';
import { useRef, useState, type ReactElement, type ReactNode } from 'react';

import { type MenuEntry, type MenuItem } from './ds/menu.js';

import { hasVisibleText } from '../../../core/src/channels/message-preview.js';
import { BridgeCallError, errorMessage, type BridgeCall } from './bridge.js';
import { GroupCreationRejected } from './features/channels/bridge.js';
import {
  GroupMemberPicker,
  GroupMemberResults,
  groupSelectionNeedsOwner,
  useGroupMemberBatch,
  type PickedGroupMember,
  type GroupBotPortrait,
} from './group-member-picker.js';
import type { ChannelSummary } from './store.js';
import { ungroupedLabel } from './labels.js';
import type { BotHarnessTranslate } from './locale.js';
import { ConfirmDialog, FormDialog, type DialogLabels } from './ds/form-dialog.js';
import { TextField } from './ds/field.js';
import type { RosterSection } from './roster.js';

export type BotMenuTranslate = BotHarnessTranslate;

export function globalSortMenuItems(
  t: BotMenuTranslate,
  options: { hasUnread?: boolean } = {},
): readonly MenuEntry[] {
  return [
    { type: 'label', id: 'sort-label', text: t('sort.menu.label') },
    { id: 'updated', label: t('sort.updated') },
    { id: 'manual', label: t('sort.manual') },
    { type: 'separator', id: 'roster-separator' },
    { id: 'mark-all-read', label: t('roster.markAllRead'), disabled: options.hasUnread !== true },
    { id: 'hidden', label: t('hidden.manage') },
    { id: 'channel-history', label: t('purge.history') },
  ];
}

export function pinnedSortMenuItems(t: BotMenuTranslate): readonly MenuEntry[] {
  return [
    { type: 'label', id: 'pinned-sort-label', text: t('pin.sort') },
    { id: 'updated', label: t('sort.updated') },
    { id: 'manual', label: t('sort.manual') },
    { id: 'inherit', label: t('sort.inherit') },
  ];
}

export function sectionMenuItems(
  t: BotMenuTranslate,
  options: { canMoveUp?: boolean; canMoveDown?: boolean } = {},
): readonly MenuEntry[] {
  const { canMoveUp = true, canMoveDown = true } = options;
  return [
    { type: 'label', id: 'sort-label', text: t('sort.menu.label') },
    { id: 'updated', label: t('sort.updated') },
    { id: 'manual', label: t('sort.manual') },
    { id: 'inherit', label: t('sort.inherit') },
    { type: 'separator', id: 'section-separator' },
    { id: 'move-up', label: t('section.moveUp'), disabled: !canMoveUp },
    { id: 'move-down', label: t('section.moveDown'), disabled: !canMoveDown },
    { type: 'separator', id: 'section-action-separator' },
    {
      id: 'rename',
      label: t('section.rename'),
      icon: <Icon name="pencil" />,
    },
    {
      id: 'delete',
      label: t('section.delete'),
      icon: <Icon name="trash" />,
      danger: true,
    },
  ];
}

export const UNGROUPED_MOVE_TARGET = 'ungrouped';

export const NEW_SECTION_MOVE_TARGET = 'new-section';

const CHANNEL_NAME_MAX = 200;
function checkedTargetLabel(text: string): ReactElement {
  return (
    <span {...stylex.props(rosterStyles.menuLabel)}>
      <span {...stylex.props(rosterStyles.truncate)}>{text}</span>
      <Icon name="check" />
    </span>
  );
}

export function channelMoveMenuItems(
  t: BotMenuTranslate,
  sections: readonly RosterSection[],
  currentSectionId: string | undefined,
): readonly MenuEntry[] {
  const target = (id: string, name: string, current: boolean): MenuItem => ({
    id,
    label: current ? checkedTargetLabel(name) : name,
  });
  return [
    {
      id: 'move',
      label: t('move.menu.label'),
      submenu: [
        target(NEW_SECTION_MOVE_TARGET, t('move.newSection'), false),
        ...sections.map((section) =>
          target(section.id, section.name, section.id === currentSectionId),
        ),
        target(UNGROUPED_MOVE_TARGET, ungroupedLabel(t), currentSectionId === undefined),
      ],
    },
  ];
}

export interface SectionRenameModalProps {
  section: RosterSection;
  t: BotHarnessTranslate;
  onCancel: () => void;
  onRename: (name: string) => Promise<boolean>;
}

function dialogLabels(t: BotHarnessTranslate): DialogLabels {
  return { close: t('common.close'), cancel: t('common.cancel') };
}

function useSectionMutation(operation: () => Promise<boolean>) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = (): void => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    void Promise.resolve()
      .then(operation)
      .then(
        (success) => setFailed(!success),
        () => setFailed(true),
      )
      .finally(() => {
        pending.current = false;
        setBusy(false);
      });
  };
  return { busy, failed, submit };
}

export function SectionRenameModal({
  section,
  t,
  onCancel,
  onRename,
}: SectionRenameModalProps): ReactElement {
  const [draft, setDraft] = useState(section.name);
  const trimmed = draft.trim();
  const mutation = useSectionMutation(() => onRename(trimmed));
  return (
    <FormDialog
      title={t('section.rename.title')}
      labels={dialogLabels(t)}
      submitLabel={t('common.rename')}
      submitDisabled={trimmed.length === 0}
      busy={mutation.busy}
      error={mutation.failed ? t('section.updateFailed') : undefined}
      onCancel={() => {
        if (!mutation.busy) onCancel();
      }}
      onSubmit={mutation.submit}
    >
      <TextField
        label={t('section.name.label')}
        placeholder={t('section.name.placeholder')}
        value={draft}
        onChange={setDraft}
        initialFocus
        selectOnFocus
      />
    </FormDialog>
  );
}

export interface ChannelRenameModalProps {
  name: string;
  bot: boolean;
  t: BotHarnessTranslate;
  onCancel: () => void;
  onRename: (name: string) => Promise<string | undefined>;
}

export function ChannelRenameModal({
  name,
  bot,
  t,
  onCancel,
  onRename,
}: ChannelRenameModalProps): ReactElement {
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const trimmed = draft.trim();
  const label = bot ? t('bot.name.label') : t('channel.name.label');
  const submit = (): void => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    void onRename(trimmed)
      .then(setError, () => setError(t('channel.renameFailed')))
      .finally(() => {
        pending.current = false;
        setBusy(false);
      });
  };
  return (
    <FormDialog
      title={bot ? t('bot.rename.title') : t('channel.rename.title')}
      labels={dialogLabels(t)}
      submitLabel={t('common.rename')}
      submitDisabled={trimmed.length === 0}
      busy={busy}
      error={error}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <TextField
        label={label}
        placeholder={label}
        value={draft}
        disabled={busy}
        onChange={setDraft}
        initialFocus
        selectOnFocus
      />
    </FormDialog>
  );
}

export interface SectionDeleteModalProps {
  section: RosterSection;
  t: BotHarnessTranslate;
  onCancel: () => void;
  onDelete: () => Promise<boolean>;
}

export function SectionDeleteModal({
  section,
  t,
  onCancel,
  onDelete,
}: SectionDeleteModalProps): ReactElement {
  const mutation = useSectionMutation(onDelete);
  return (
    <ConfirmDialog
      title={t('section.delete.title')}
      description={t('section.delete.description', { name: section.name })}
      labels={dialogLabels(t)}
      confirmLabel={t('common.delete')}
      busy={mutation.busy}
      error={mutation.failed ? t('section.updateFailed') : undefined}
      onCancel={() => {
        if (!mutation.busy) onCancel();
      }}
      onConfirm={mutation.submit}
    />
  );
}

export interface CreateSectionModalProps {
  t: BotHarnessTranslate;
  onCancel: () => void;
  onCreate: (name: string) => Promise<boolean>;
}

export function CreateSectionModal({
  t,
  onCancel,
  onCreate,
}: CreateSectionModalProps): ReactElement {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const mutation = useSectionMutation(() => onCreate(trimmed));
  return (
    <FormDialog
      title={t('section.create.title')}
      labels={dialogLabels(t)}
      submitLabel={t('common.create')}
      submitDisabled={trimmed.length === 0}
      busy={mutation.busy}
      error={mutation.failed ? t('section.updateFailed') : undefined}
      onCancel={() => {
        if (!mutation.busy) onCancel();
      }}
      onSubmit={mutation.submit}
    >
      <TextField
        label={t('section.name.label')}
        placeholder={t('section.name.placeholder')}
        value={draft}
        onChange={setDraft}
        initialFocus
      />
    </FormDialog>
  );
}

export interface CreateChannelModalProps {
  committed?: boolean;
  submitted?: boolean;
  target?: ReactNode;
  targetUnavailable?: boolean;
  sectionName?: string | undefined;
  t: BotHarnessTranslate;
  members?:
    | { scope: string; call: BridgeCall; botPortrait?: GroupBotPortrait | undefined }
    | undefined;
  onCancel: () => void;
  onCreate: (
    name: string,
    operationKey: string,
    onDispatch: () => void,
    initial: GroupInitialMembers,
  ) => Promise<ChannelSummary | void>;
  onCreateRejected?: () => void;
  onMembersChanged?: ((channel: ChannelSummary) => void) | undefined;
}

export interface GroupInitialMembers {
  members: string[];
  humanIds: string[];
}

export function splitInitialMembers(selected: readonly PickedGroupMember[]): {
  initial: GroupInitialMembers;
  later: PickedGroupMember[];
} {
  return {
    initial: {
      members: selected
        .filter((row) => row.kind === 'bot' && !row.requiresOwner)
        .map((row) => row.id),
      humanIds: selected.filter((row) => row.kind === 'human').map((row) => row.id),
    },
    later: selected.filter((row) => row.kind === 'bot' && row.requiresOwner === true),
  };
}

export function CreateChannelModal({
  committed = false,
  submitted = false,
  target,
  targetUnavailable = false,
  sectionName,
  members,
  t,
  onCancel,
  onCreate,
  onCreateRejected,
  onMembersChanged,
}: CreateChannelModalProps): ReactElement {
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [selection, setSelection] = useState<{
    scope: string | undefined;
    call: BridgeCall | undefined;
    members: PickedGroupMember[];
  }>({
    scope: members?.scope,
    call: members?.call,
    members: [],
  });
  const [submittedHere, setSubmittedHere] = useState(false);
  const scope = members?.scope;
  const pickerCall = members?.call;
  const sameHost = selection.scope === scope && selection.call === pickerCall;
  if (!sameHost && !submittedHere) setSelection({ scope, call: pickerCall, members: [] });
  const bindingChanged = submittedHere && !sameHost;
  const selected = bindingChanged ? [] : selection.members;
  const attempt = useRef<{
    key: string;
    name: string;
    selection: typeof selection;
    plan: ReturnType<typeof splitInitialMembers>;
  }>();
  const created = useRef<ChannelSummary>();
  const batch = useGroupMemberBatch();
  const trimmed = draft.trim();
  const missingOwner = !batch.items && groupSelectionNeedsOwner(selected);
  const submit = (): void => {
    if (batch.complete) {
      onCancel();
      return;
    }
    if (
      pending.current ||
      !hasVisibleText(trimmed) ||
      targetUnavailable ||
      bindingChanged ||
      missingOwner
    )
      return;
    pending.current = true;
    setCreating(true);
    setError(undefined);
    const run = async () => {
      const previous = attempt.current;
      const retry =
        previous?.name === trimmed && previous.selection === selection ? previous : undefined;
      const plan = retry?.plan ?? splitInitialMembers(members ? selected : []);
      if (!created.current) {
        const operationKey = retry?.key ?? crypto.randomUUID();
        created.current =
          (await onCreate(
            trimmed,
            operationKey,
            () => {
              attempt.current = { key: operationKey, name: trimmed, selection, plan };
              setSubmittedHere(true);
            },
            plan.initial,
          )) ?? undefined;
      }
      if (!members || plan.later.length === 0 || !created.current) {
        if (created.current) onCancel();
        return;
      }
      await batch.apply(members.call, created.current.id, plan.later);
      onMembersChanged?.(created.current);
    };
    void run().then(
      () => {
        pending.current = false;
        setCreating(false);
      },
      (cause: unknown) => {
        pending.current = false;
        if (!submittedHere && !submitted && cause instanceof GroupCreationRejected) {
          setSubmittedHere(false);
          onCreateRejected?.();
        }
        setError(
          cause instanceof BridgeCallError && cause.code === 'connection-host-changed'
            ? t('environment.create.changed')
            : errorMessage(cause),
        );
        setCreating(false);
      },
    );
  };
  return (
    <FormDialog
      title={
        sectionName === undefined
          ? t('channel.create.title')
          : t('channel.create.inSection', { name: sectionName })
      }
      labels={batch.items ? { ...dialogLabels(t), cancel: t('common.close') } : dialogLabels(t)}
      submitLabel={t(
        batch.complete
          ? 'common.close'
          : batch.items
            ? 'groupMembers.retry'
            : committed
              ? 'environment.create.finish'
              : submitted || submittedHere
                ? 'environment.create.retry'
                : 'common.create',
      )}
      submitDisabled={
        !batch.complete &&
        (!hasVisibleText(trimmed) || targetUnavailable || bindingChanged || missingOwner)
      }
      busy={creating}
      showCancel={!batch.complete}
      scroll
      error={
        error === undefined
          ? undefined
          : t(
              batch.items
                ? 'groupMembers.unconfirmed'
                : committed
                  ? 'environment.create.finishFailed'
                  : submitted || submittedHere
                    ? 'environment.create.unknown'
                    : 'create.failed',
              { error },
            )
      }
      onCancel={() => {
        if (!creating) onCancel();
      }}
      onSubmit={submit}
    >
      {target}
      <TextField
        label={t('channel.name.label')}
        disabled={creating || committed || submitted || submittedHere}
        placeholder={t('channel.name.placeholder')}
        value={draft}
        onChange={setDraft}
        maxLength={CHANNEL_NAME_MAX}
        initialFocus
      />
      {batch.items ? (
        <GroupMemberResults items={batch.items} busy={creating} t={t} />
      ) : members && !targetUnavailable && !bindingChanged ? (
        <GroupMemberPicker
          key={scope}
          call={members.call}
          botPortrait={members.botPortrait}
          t={t}
          selected={selected}
          disabled={creating || submitted || submittedHere}
          onChange={(members) => setSelection({ scope, call: pickerCall, members })}
        />
      ) : null}
    </FormDialog>
  );
}
