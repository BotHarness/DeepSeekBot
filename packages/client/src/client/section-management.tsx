import { useState, type ReactElement } from 'react';

import {
  IconCheckOutlineRegular,
  IconEditOutlineRegular,
  IconTrashOutlineRegular,
  type MenuEntry,
  type MenuItem,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { errorMessage } from './bridge.js';
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
      icon: <IconEditOutlineRegular />,
    },
    {
      id: 'delete',
      label: t('section.delete'),
      icon: <IconTrashOutlineRegular />,
      danger: true,
    },
  ];
}

export const UNGROUPED_MOVE_TARGET = 'ungrouped';

export const NEW_SECTION_MOVE_TARGET = 'new-section';
function checkedTargetLabel(text: string): ReactElement {
  return (
    <span className="bh-move-checked">
      <span className="bh-move-checked-text">{text}</span>
      <IconCheckOutlineRegular />
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
  onRename: (name: string) => void;
}

function dialogLabels(t: BotHarnessTranslate): DialogLabels {
  return { close: t('common.close'), cancel: t('common.cancel') };
}

export function SectionRenameModal({
  section,
  t,
  onCancel,
  onRename,
}: SectionRenameModalProps): ReactElement {
  const [draft, setDraft] = useState(section.name);
  const trimmed = draft.trim();
  return (
    <FormDialog
      title={t('section.rename.title')}
      labels={dialogLabels(t)}
      submitLabel={t('common.rename')}
      submitDisabled={trimmed.length === 0}
      onCancel={onCancel}
      onSubmit={() => onRename(trimmed)}
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
  onRename: (name: string) => void;
}

export function ChannelRenameModal({
  name,
  bot,
  t,
  onCancel,
  onRename,
}: ChannelRenameModalProps): ReactElement {
  const [draft, setDraft] = useState(name);
  const trimmed = draft.trim();
  const label = bot ? t('bot.name.label') : t('channel.name.label');
  return (
    <FormDialog
      title={bot ? t('bot.rename.title') : t('channel.rename.title')}
      labels={dialogLabels(t)}
      submitLabel={t('common.rename')}
      submitDisabled={trimmed.length === 0}
      onCancel={onCancel}
      onSubmit={() => onRename(trimmed)}
    >
      <TextField
        label={label}
        placeholder={label}
        value={draft}
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
  onDelete: () => void;
}

export function SectionDeleteModal({
  section,
  t,
  onCancel,
  onDelete,
}: SectionDeleteModalProps): ReactElement {
  return (
    <ConfirmDialog
      title={t('section.delete.title')}
      description={t('section.delete.description', { name: section.name })}
      labels={dialogLabels(t)}
      confirmLabel={t('common.delete')}
      onCancel={onCancel}
      onConfirm={onDelete}
    />
  );
}

export interface CreateSectionModalProps {
  t: BotHarnessTranslate;
  onCancel: () => void;
  onCreate: (name: string) => void;
}

export function CreateSectionModal({
  t,
  onCancel,
  onCreate,
}: CreateSectionModalProps): ReactElement {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  return (
    <FormDialog
      title={t('section.create.title')}
      labels={dialogLabels(t)}
      submitLabel={t('common.create')}
      submitDisabled={trimmed.length === 0}
      onCancel={onCancel}
      onSubmit={() => onCreate(trimmed)}
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
  sectionName?: string | undefined;
  t: BotHarnessTranslate;
  onCancel: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function CreateChannelModal({
  sectionName,
  t,
  onCancel,
  onCreate,
}: CreateChannelModalProps): ReactElement {
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const trimmed = draft.trim();
  const submit = (): void => {
    setCreating(true);
    setError(undefined);
    void onCreate(trimmed).then(
      () => {
        setCreating(false);
      },
      (cause: unknown) => {
        setError(errorMessage(cause));
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
      labels={dialogLabels(t)}
      submitLabel={t('common.create')}
      submitDisabled={trimmed.length === 0}
      busy={creating}
      error={error === undefined ? undefined : t('create.failed', { error })}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <TextField
        label={t('channel.name.label')}
        placeholder={t('channel.name.placeholder')}
        value={draft}
        onChange={setDraft}
        initialFocus
      />
    </FormDialog>
  );
}
