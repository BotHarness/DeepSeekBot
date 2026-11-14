import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeCall } from './bridge.js';
import { FieldStack, TextField } from './ds/field.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { color, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { TeamMember } from './team-bridge.js';
import {
  createRole,
  deleteRole,
  loadMemberDevices,
  revokeMemberDevice,
  setMemberRoles,
  transferOwnership,
  updateRole,
  type MemberDevice,
  type PermissionEntry,
  type PermissionGroup,
  canGrant,
  canGrantAll,
  type GrantingViewer,
  type TeamRole,
} from './team-roles-bridge.js';
import { teamErrorText } from './team-settings.js';

const styles = stylex.create({
  group: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
  groupTitle: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  checks: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  hint: {
    margin: 0,
    paddingInlineStart: space.x6,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  devices: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  danger: { color: color.danger },
  fieldset: { borderWidth: 0, padding: 0, margin: 0, minWidth: 0 },
  sheet: { display: 'flex', flexDirection: 'column', gap: space.x5, minWidth: 0 },
});

const GROUP_ORDER: readonly PermissionGroup[] = [
  'members',
  'channels',
  'bots',
  'compute',
  'oversight',
];

export function permissionLabel(t: BotHarnessTranslate, id: string): string {
  const key = `team.permission.${id}` as BotHarnessKey;
  const label = t(key);
  return label === key ? id : label;
}

function permissionHint(t: BotHarnessTranslate, id: string): string | undefined {
  const key = `team.permission.${id}.hint` as BotHarnessKey;
  const hint = t(key);
  return hint === key ? undefined : hint;
}

export function roleLabel(t: BotHarnessTranslate, role: TeamRole): string {
  if (role.builtin === 'admin') return t('team.role.admin');
  if (role.builtin === 'member') return t('team.role.member');
  return role.name;
}

export function RolesSection({
  call,
  t,
  roles,
  catalog,
  canEdit,
  viewer,
  onChanged,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  roles: readonly TeamRole[];
  catalog: readonly PermissionEntry[];
  canEdit: boolean;
  viewer: GrantingViewer;
  onChanged(): void;
}): ReactElement {
  const [editing, setEditing] = useState<TeamRole | 'new'>();
  return (
    <SettingsSection>
      <SettingsRow
        title={t('team.roles.title')}
        data={{ 'data-team-row': 'roles' }}
        control={
          canEdit ? (
            <Button variant="outline" onClick={() => setEditing('new')}>
              {t('team.roles.new')}
            </Button>
          ) : undefined
        }
      />
      <div role="list" aria-label={t('team.roles.title')}>
        {roles.map((role) => (
          <div role="listitem" key={role.roleId} data-team-role={role.roleId}>
            <SettingsRow
              title={roleLabel(t, role)}
              description={t(
                role.memberCount === 1 ? 'team.roles.summaryOne' : 'team.roles.summary',
                {
                  people: String(role.memberCount),
                  permissions: String(role.permissions.length),
                },
              )}
              control={
                canEdit && canGrantAll(viewer, role.permissions) ? (
                  <Button
                    variant="outline"
                    aria-label={t('team.roles.editNamed', { name: roleLabel(t, role) })}
                    onClick={() => setEditing(role)}
                  >
                    {t('team.roles.edit')}
                  </Button>
                ) : undefined
              }
            />
          </div>
        ))}
      </div>
      {editing === undefined ? null : (
        <RoleDialog
          call={call}
          t={t}
          role={editing === 'new' ? undefined : editing}
          catalog={catalog}
          viewer={viewer}
          onCancel={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            onChanged();
          }}
        />
      )}
    </SettingsSection>
  );
}

function RoleDialog({
  call,
  t,
  role,
  catalog,
  viewer,
  onCancel,
  onSaved,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  role: TeamRole | undefined;
  catalog: readonly PermissionEntry[];
  viewer: GrantingViewer;
  onCancel(): void;
  onSaved(): void;
}): ReactElement {
  const [name, setName] = useState(role?.name ?? '');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const builtin = role?.builtin ?? null;
  const ready = builtin !== null || name.trim().length > 0;
  const run = (work: () => Promise<unknown>): void => {
    setBusy(true);
    setError(undefined);
    work()
      .then(onSaved)
      .catch((failure: unknown) => {
        setError(teamErrorText(t, failure));
        setBusy(false);
      });
  };
  const toggle = (id: string, on: boolean): void => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    setChosen(next);
  };
  if (confirmDelete && role !== undefined)
    return (
      <ConfirmDialog
        title={t('team.roles.deleteTitle', { name: role.name })}
        description={t('team.roles.deleteBody')}
        labels={{ close: t('common.close'), cancel: t('common.cancel') }}
        confirmLabel={t('common.delete')}
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => run(() => deleteRole(call, role.roleId))}
      />
    );
  return (
    <FormDialog
      title={
        role === undefined
          ? t('team.roles.newTitle')
          : t('team.roles.editTitle', { name: roleLabel(t, role) })
      }
      size="medium"
      scroll
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('team.save')}
      submitDisabled={!ready}
      busy={busy}
      error={error === undefined ? undefined : <Note tone="danger">{error}</Note>}
      secondary={
        role !== undefined && builtin === null ? (
          <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(true)}>
            <span {...stylex.props(styles.danger)}>{t('common.delete')}</span>
          </Button>
        ) : undefined
      }
      onCancel={onCancel}
      onSubmit={() =>
        run(() =>
          role === undefined
            ? createRole(call, { name: name.trim(), permissions: [...chosen] })
            : updateRole(call, {
                roleId: role.roleId,
                ...(builtin === null ? { name: name.trim() } : {}),
                permissions: [...chosen],
              }),
        )
      }
    >
      <FieldStack>
        {builtin === null ? (
          <TextField
            label={t('team.roles.name')}
            value={name}
            onChange={setName}
            maxLength={40}
            initialFocus
          />
        ) : null}
        {GROUP_ORDER.map((group) => {
          const entries = catalog.filter((entry) => entry.group === group);
          if (entries.length === 0) return null;
          return (
            <fieldset key={group} {...stylex.props(styles.group, styles.fieldset)}>
              <legend {...stylex.props(styles.groupTitle)}>
                {t(`team.permissionGroup.${group}`)}
              </legend>
              <div {...stylex.props(styles.checks)}>
                {entries.map((entry) => {
                  const locked =
                    (builtin === 'admin' && entry.id === 'privateContent.view') ||
                    !canGrant(viewer, entry.id);
                  const hint = permissionHint(t, entry.id);
                  return (
                    <div key={entry.id} data-permission={entry.id}>
                      <Checkbox
                        label={permissionLabel(t, entry.id)}
                        checked={chosen.has(entry.id)}
                        disabled={busy || locked}
                        onChange={(checked) => toggle(entry.id, checked)}
                      />
                      {hint === undefined ? null : <p {...stylex.props(styles.hint)}>{hint}</p>}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </FieldStack>
    </FormDialog>
  );
}

export function MemberSheet({
  call,
  t,
  member,
  roles,
  canManageRoles,
  canTransfer,
  self,
  viewer,
  onClose,
  onChanged,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  member: TeamMember;
  roles: readonly TeamRole[];
  viewer: GrantingViewer;
  canManageRoles: boolean;
  canTransfer: boolean;
  self: boolean;
  onClose(): void;
  onChanged(): void;
}): ReactElement {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set(member.roleIds));
  const [devices, setDevices] = useState<readonly MemberDevice[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [transfer, setTransfer] = useState(false);
  const request = useRef(0);
  const refresh = (signal?: AbortSignal): void => {
    const version = ++request.current;
    loadMemberDevices(call, member.humanId, signal)
      .then((value) => {
        if (version === request.current) setDevices(value);
      })
      .catch((failure: unknown) => {
        if (version === request.current && signal?.aborted !== true)
          setError(teamErrorText(t, failure));
      });
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [call, member.humanId]);
  const dirty =
    chosen.size !== member.roleIds.length || member.roleIds.some((id) => !chosen.has(id));
  if (transfer)
    return (
      <TransferOwnershipDialog
        call={call}
        t={t}
        member={member}
        onCancel={() => setTransfer(false)}
        onDone={() => {
          setTransfer(false);
          onChanged();
          onClose();
        }}
      />
    );
  return (
    <FormDialog
      title={member.displayName}
      description={`@${member.username}`}
      size="medium"
      scroll
      labels={{ close: t('common.close'), cancel: t('common.close') }}
      submitLabel={t('team.save')}
      submitDisabled={!dirty || chosen.size === 0}
      busy={busy}
      error={error === undefined ? undefined : <Note tone="danger">{error}</Note>}
      secondary={
        canTransfer && !member.owner && member.status === 'active' ? (
          <Button variant="outline" disabled={busy} onClick={() => setTransfer(true)}>
            <span {...stylex.props(styles.danger)}>{t('team.owner.transfer')}</span>
          </Button>
        ) : undefined
      }
      onCancel={onClose}
      onClose={onClose}
      {...(canManageRoles && !member.owner
        ? {
            onSubmit: () => {
              setBusy(true);
              setError(undefined);
              setMemberRoles(call, member.humanId, [...chosen])
                .then(() => {
                  onChanged();
                  onClose();
                })
                .catch((failure: unknown) => {
                  setError(teamErrorText(t, failure));
                  setBusy(false);
                });
            },
          }
        : {})}
    >
      <div ref={mount} {...stylex.props(styles.sheet)}>
        {member.owner ? (
          <Note>{t('team.owner.noRoles')}</Note>
        ) : (
          <fieldset {...stylex.props(styles.group, styles.fieldset)}>
            <legend {...stylex.props(styles.groupTitle)}>{t('team.roles.title')}</legend>
            <div {...stylex.props(styles.checks)}>
              {roles.map((role) => (
                <div key={role.roleId} data-member-role={role.roleId}>
                  <Checkbox
                    label={roleLabel(t, role)}
                    checked={chosen.has(role.roleId)}
                    disabled={
                      busy ||
                      !canManageRoles ||
                      (self && !viewer.owner) ||
                      (role.builtin === 'admin' && !viewer.owner) ||
                      !canGrantAll(viewer, role.permissions)
                    }
                    onChange={(checked) => {
                      const next = new Set(chosen);
                      if (checked) next.add(role.roleId);
                      else next.delete(role.roleId);
                      setChosen(next);
                    }}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        )}
        <DeviceList
          call={call}
          t={t}
          humanId={member.humanId}
          devices={devices}
          self={self}
          onRevoked={() => refresh()}
        />
      </div>
    </FormDialog>
  );
}

export function DeviceList({
  call,
  t,
  humanId,
  devices,
  self,
  onRevoked,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  humanId: string;
  devices: readonly MemberDevice[] | undefined;
  self: boolean;
  onRevoked(): void;
}): ReactElement {
  const [revoking, setRevoking] = useState<MemberDevice>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div {...stylex.props(styles.group)}>
      <p {...stylex.props(styles.groupTitle)}>{t('team.devices.title')}</p>
      {devices === undefined ? (
        <Note>{t('team.channels.loading')}</Note>
      ) : devices.length === 0 ? (
        <Note>{t('team.devices.none')}</Note>
      ) : (
        <div role="list" {...stylex.props(styles.devices)}>
          {devices.map((device) => {
            const name = deviceName(t, device);
            return (
              <div role="listitem" key={device.grantId} data-member-device={device.grantId}>
                <SettingsRow
                  title={name}
                  description={
                    device.current && self
                      ? t('team.devices.thisDevice')
                      : t('team.devices.lastSeen', { time: shortTime(device.lastSeenAt) })
                  }
                  control={
                    <Button variant="outline" disabled={busy} onClick={() => setRevoking(device)}>
                      {t('team.devices.revoke')}
                    </Button>
                  }
                />
              </div>
            );
          })}
        </div>
      )}
      {error === undefined ? null : <Note tone="danger">{error}</Note>}
      {revoking === undefined ? null : (
        <ConfirmDialog
          title={t('team.devices.revokeTitle')}
          description={t(
            revoking.current && self ? 'team.devices.revokeSelf' : 'team.devices.revokeBody',
          )}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t('team.devices.revoke')}
          danger
          busy={busy}
          onCancel={() => setRevoking(undefined)}
          onConfirm={() => {
            setBusy(true);
            setError(undefined);
            revokeMemberDevice(call, humanId, revoking.grantId)
              .then(() => {
                setRevoking(undefined);
                onRevoked();
              })
              .catch((failure: unknown) => setError(teamErrorText(t, failure)))
              .finally(() => setBusy(false));
          }}
        />
      )}
    </div>
  );
}

function deviceName(t: BotHarnessTranslate, device: MemberDevice): string {
  if (device.label.length > 0) return device.label;
  return t(device.kind === 'browser' ? 'team.devices.browser' : 'team.devices.paired');
}

function shortTime(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const language = typeof document === 'undefined' ? undefined : document.documentElement.lang;
  return new Date(at).toLocaleString(language || undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TransferOwnershipDialog({
  call,
  t,
  member,
  onCancel,
  onDone,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  member: TeamMember;
  onCancel(): void;
  onDone(): void;
}): ReactElement {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <FormDialog
      title={t('team.owner.transferTitle', { name: member.displayName })}
      description={t('team.owner.transferBody', { name: member.displayName })}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('team.owner.transferConfirm')}
      danger
      submitDisabled={password.length === 0}
      busy={busy}
      error={error === undefined ? undefined : <Note tone="danger">{error}</Note>}
      onCancel={onCancel}
      onSubmit={() => {
        setBusy(true);
        setError(undefined);
        transferOwnership(call, member.humanId, password)
          .then(onDone)
          .catch((failure: unknown) => {
            setError(teamErrorText(t, failure));
            setBusy(false);
          });
      }}
    >
      <TextField
        label={t('team.owner.yourPassword')}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        initialFocus
      />
    </FormDialog>
  );
}
