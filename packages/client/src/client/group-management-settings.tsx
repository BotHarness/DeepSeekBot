import { Button } from './ds/button.js';
import { Input } from './ds/input.js';
import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { BridgeActions } from './actions.js';
import { ChannelAccessSettings } from './channel-access-settings.js';
import { ConfirmDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsRows } from './ds/settings-row.js';
import { color, radius, size, space, text } from './ds/tokens.stylex.js';
import { GroupAvatarCropModal } from './group-avatar-crop.js';
import { recheckGroupDetails, useGroupDetailsEditable } from './group-details-access.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelSummary } from './store.js';

const styles = stylex.create({
  avatarControls: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
  },
  avatar: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: size.row,
    height: size.row,
    overflow: 'hidden',
    borderRadius: radius.round,
    backgroundColor: color.hover,
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  image: { width: '100%', height: '100%', objectFit: 'cover' },
  file: { display: 'none' },
  value: {
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    overflowWrap: 'anywhere',
  },
  field: {
    boxSizing: 'border-box',
    width: '200px',
    maxWidth: '100%',
    minWidth: 0,
  },
});

export function GroupManagementSettings({
  actions,
  t,
  group,
}: {
  readonly actions: BridgeActions;
  readonly t: BotHarnessTranslate;
  readonly group: ChannelSummary;
}): ReactElement {
  const [nameState, setNameState] = useState({
    source: group.name,
    draft: group.name,
  });
  if (nameState.source !== group.name) setNameState({ source: group.name, draft: group.name });
  const name = nameState.source === group.name ? nameState.draft : group.name;
  const [cropFile, setCropFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'failed' | 'refused'>();
  const editable = useGroupDetailsEditable(actions.teamCall, group.id) === true;
  const fileInput = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const pending = useRef(false);
  const apply = async (result: Promise<boolean>): Promise<boolean> => {
    pending.current = true;
    setBusy(true);
    try {
      const ok = await result;
      if (ok) setError(undefined);
      else {
        const allowed = await recheckGroupDetails(actions.teamCall, group.id);
        if (!allowed) setNameState({ source: group.name, draft: group.name });
        setError(allowed ? 'failed' : 'refused');
      }
      return ok;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const errorNote =
    error === undefined ? null : (
      <Note tone="danger">{t(error === 'refused' ? 'group.detailsRefused' : 'members.error')}</Note>
    );
  const commitName = (): void => {
    const next = name.trim();
    if (!next) {
      setNameState({ source: group.name, draft: group.name });
      return;
    }
    if (next !== group.name && !pending.current) void apply(actions.renameChannel(group.id, next));
  };
  return (
    <SettingsRows>
      <SettingsRow
        title={t('group.avatar')}
        control={
          <span {...stylex.props(styles.avatarControls)}>
            <span {...stylex.props(styles.avatar)}>
              {group.avatar ? (
                <img src={group.avatar} alt="" {...stylex.props(styles.image)} />
              ) : (
                <span aria-hidden="true">#</span>
              )}
            </span>
            {editable && group.avatar ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void apply(actions.setGroupAvatar(group.id, null))}
              >
                {t('group.avatarRemove')}
              </Button>
            ) : null}
            {editable ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                {t('group.avatarChoose')}
              </Button>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              tabIndex={-1}
              aria-hidden="true"
              {...stylex.props(styles.file)}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) setCropFile(file);
                event.currentTarget.value = '';
              }}
            />
          </span>
        }
      />
      <SettingsRow
        title={t('group.name')}
        {...(editable ? {} : { description: t('group.detailsAdminsOnly') })}
        control={
          editable ? (
            <Input
              aria-label={t('group.name')}
              className={stylex.props(styles.field).className ?? ''}
              value={name}
              maxLength={120}
              disabled={busy}
              onChange={(event) =>
                setNameState({
                  source: group.name,
                  draft: event.currentTarget.value,
                })
              }
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setNameState({ source: group.name, draft: group.name });
                  return;
                }
                if (event.key !== 'Enter' || composing.current) return;
                event.preventDefault();
                commitName();
              }}
              onBlur={commitName}
            />
          ) : (
            <span data-group-name="read-only" {...stylex.props(styles.value)}>
              {group.name}
            </span>
          )
        }
      >
        {errorNote}
      </SettingsRow>
      {actions.teamCall === undefined ? null : (
        <ChannelAccessSettings
          call={actions.teamCall}
          channelId={group.id}
          humans={group.humanMembers ?? []}
          t={t}
        />
      )}
      {cropFile && editable ? (
        <GroupAvatarCropModal
          file={cropFile}
          t={t}
          onClose={() => setCropFile(undefined)}
          onSave={(avatar) => apply(actions.setGroupAvatar(group.id, avatar))}
        />
      ) : null}
    </SettingsRows>
  );
}

export function DisbandGroupDialog({
  group,
  actions,
  t,
  onClose,
}: {
  readonly group: ChannelSummary;
  readonly actions: BridgeActions;
  readonly t: BotHarnessTranslate;
  readonly onClose: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const disband = async (): Promise<void> => {
    setBusy(true);
    setError(false);
    try {
      if (await actions.deleteGroupChannel(group.id)) onClose();
      else setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog
      title={t('members.delete')}
      description={t('members.deleteConfirm', { name: group.name })}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      confirmLabel={t('members.delete')}
      busy={busy}
      error={error ? t('members.error') : undefined}
      onCancel={onClose}
      onConfirm={() => void disband()}
    />
  );
}
