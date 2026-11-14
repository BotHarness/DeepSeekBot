import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import type { BridgeCall } from './bridge.js';
import { Callout } from './ds/callout.js';
import { FieldStack, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsRows, SettingsSection } from './ds/settings-row.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { TeamUsageSection } from './team-usage-section.js';
import { USAGE_VIEW } from './team-usage.js';
import { useMountedResource } from './mounted-resource.js';
import {
  TEAM_ENTRY_PATH,
  TEAM_PASSWORD_MIN_LENGTH,
  createMember,
  loadMembers,
  loadTeamMode,
  setInsecureHttp,
  setOwnerPassword,
  setTeamMode,
  signOutMember,
  teamRefusal,
  validUsername,
  type CreatedMember,
  type TeamMember,
  type TeamModeView,
  type TeamRefusal,
} from './team-bridge.js';
import { MemberPasswordDialog } from './team-password-dialog.js';
import { DeviceList, MemberSheet, RolesSection } from './team-roles.js';
import {
  MANAGE_MEMBERS,
  MANAGE_ROLES,
  canManage,
  loadMemberDevices,
  loadPermissionCatalog,
  loadRoles,
  type MemberDevice,
  type PermissionEntry,
  type TeamRole,
} from './team-roles-bridge.js';
import { setTeamModeSnapshot } from './team-state.js';

const styles = stylex.create({
  members: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  memberMeta: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  urls: { display: 'flex', flexDirection: 'column', gap: space.x1, minWidth: 0 },
  url: {
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    color: color.fg,
    overflowWrap: 'anywhere',
  },
  secret: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    padding: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.well,
  },
  secretValue: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    color: color.fg,
    overflowWrap: 'anywhere',
    userSelect: 'all',
  },
  facts: {
    margin: 0,
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: space.x4,
    rowGap: space.x1,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  factLabel: { color: color.muted },
  factValue: { margin: 0, color: color.fg, overflowWrap: 'anywhere' },
});

export type TeamSectionProps = PropsLocale<'botharness'> & InjectFace<{ call: BridgeCall }>;

const REFUSAL_COPY: Record<TeamRefusal, BotHarnessKey> = {
  'owner-password-required': 'team.error.ownerPasswordRequired',
  'password-weak': 'team.error.passwordWeak',
  'password-reused': 'team.error.passwordReused',
  'password-change-required': 'team.error.passwordChangeRequired',
  'credentials-invalid': 'team.error.credentialsInvalid',
  'team-mode-off': 'team.error.teamModeOff',
  'username-invalid': 'team.error.usernameInvalid',
  'username-taken': 'team.error.usernameTaken',
  'channel-not-public': 'team.error.channelNotPublic',
  'channel-not-found': 'team.error.channelNotFound',
  'permission-required': 'team.error.permissionRequired',
  'role-name-invalid': 'team.error.roleNameInvalid',
  'role-name-taken': 'team.error.roleNameTaken',
  'role-builtin': 'team.error.roleBuiltin',
  'owner-protected': 'team.error.ownerProtected',
  'member-not-found': 'team.error.memberNotFound',
  'device-not-found': 'team.error.deviceNotFound',
  'member-suspended': 'team.error.memberSuspended',
  'permission-not-grantable': 'team.error.permissionNotGrantable',
  'owner-transfer-target-unverified': 'team.error.ownerTransferUnverified',
  'model-not-allowed': 'team.error.modelNotAllowed',
};

export function teamErrorText(t: BotHarnessTranslate, error: unknown): string {
  const code = teamRefusal(error);
  return t(code === undefined ? 'team.error.generic' : REFUSAL_COPY[code]);
}

type Dialog =
  | { kind: 'owner-password'; thenEnable: boolean }
  | { kind: 'insecure-http' }
  | { kind: 'add-member' }
  | { kind: 'created'; created: CreatedMember }
  | { kind: 'own-password' }
  | { kind: 'member'; humanId: string }
  | { kind: 'my-devices' };

export function TeamSection({ call, t }: TeamSectionProps): ReactElement {
  const [view, setView] = useState<TeamModeView>();
  const [members, setMembers] = useState<readonly TeamMember[]>();
  const [roles, setRoles] = useState<readonly TeamRole[]>([]);
  const [catalog, setCatalog] = useState<readonly PermissionEntry[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string>();
  const [dialog, setDialog] = useState<Dialog>();
  const request = useRef(0);
  const passwordSaved = useRef(false);
  const publish = (next: TeamModeView): void => {
    setView(next);
    setTeamModeSnapshot(call, next);
  };

  const refresh = async (signal?: AbortSignal): Promise<void> => {
    const version = ++request.current;
    try {
      const next = await loadTeamMode(call, signal);
      const admin = canManage(next.viewer, MANAGE_MEMBERS) || canManage(next.viewer, MANAGE_ROLES);
      const canMembers = canManage(next.viewer, MANAGE_MEMBERS);
      const [list, roleList, permissions] = admin
        ? await Promise.all([
            canMembers ? loadMembers(call, signal) : Promise.resolve([]),
            loadRoles(call, signal).catch(() => []),
            loadPermissionCatalog(call, signal).catch(() => []),
          ])
        : [[], [], []];
      if (signal?.aborted === true || version !== request.current) return;
      publish(next);
      setMembers(list);
      setRoles(roleList);
      setCatalog(permissions);
      setLoadFailed(false);
    } catch {
      if (signal?.aborted !== true && version === request.current) setLoadFailed(true);
    }
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [call]);

  const apply = async (action: () => Promise<TeamModeView>): Promise<void> => {
    setBusy(true);
    setRowError(undefined);
    try {
      publish(await action());
      await refresh();
    } catch (error) {
      setRowError(teamErrorText(t, error));
    } finally {
      setBusy(false);
    }
  };

  const toggleTeamMode = (enabled: boolean): void => {
    if (view === undefined) return;
    if (enabled && !view.ownerPasswordSet) {
      setDialog({ kind: 'owner-password', thenEnable: true });
      return;
    }
    void apply(() => setTeamMode(call, enabled));
  };

  const toggleInsecureHttp = (allowed: boolean): void => {
    if (allowed) setDialog({ kind: 'insecure-http' });
    else void apply(() => setInsecureHttp(call, false));
  };

  if (view === undefined)
    return (
      <SettingsRows rootRef={mount}>
        {loadFailed ? <Note tone="danger">{t('team.error.load')}</Note> : null}
      </SettingsRows>
    );

  const viewer = view.viewer;
  const manageMembers = canManage(viewer, MANAGE_MEMBERS);
  const manageRoles = canManage(viewer, MANAGE_ROLES);
  const usage =
    view.enabled && canManage(viewer, USAGE_VIEW) ? <TeamUsageSection call={call} t={t} /> : null;
  const sheetMember =
    dialog?.kind === 'member' ? members?.find((row) => row.humanId === dialog.humanId) : undefined;
  const admin =
    manageMembers || manageRoles ? (
      <>
        {view.enabled || (members !== undefined && members.length > 1) ? (
          <SettingsSection>
            <SettingsRow
              title={t('team.members.title')}
              control={
                manageMembers ? (
                  <Button
                    variant="outline"
                    disabled={!view.enabled}
                    onClick={() => setDialog({ kind: 'add-member' })}
                  >
                    {t('team.members.add')}
                  </Button>
                ) : undefined
              }
            />
            <div {...stylex.props(styles.members)} role="list" aria-label={t('team.members.title')}>
              {(members ?? []).map((member) => (
                <div role="listitem" key={member.humanId} data-team-member={member.username}>
                  <SettingsRow
                    title={member.displayName}
                    description={memberMeta(t, member, roles)}
                    control={
                      <Button
                        variant="outline"
                        aria-label={t('team.members.manageNamed', { name: member.displayName })}
                        onClick={() => setDialog({ kind: 'member', humanId: member.humanId })}
                      >
                        {t('team.members.manage')}
                      </Button>
                    }
                  />
                </div>
              ))}
            </div>
          </SettingsSection>
        ) : null}
        {roles.length > 0 ? (
          <RolesSection
            call={call}
            t={t}
            roles={roles}
            catalog={catalog}
            canEdit={manageRoles}
            viewer={viewer}
            onChanged={() => void refresh()}
          />
        ) : null}
        {sheetMember === undefined ? null : (
          <MemberSheet
            call={call}
            t={t}
            member={sheetMember}
            roles={roles}
            canManageRoles={manageRoles || manageMembers}
            canTransfer={viewer.owner && viewer.kind === 'owner'}
            self={sheetMember.humanId === viewer.humanId}
            viewer={viewer}
            onClose={() => setDialog(undefined)}
            onChanged={() => void refresh()}
          />
        )}
        {dialog?.kind === 'add-member' ? (
          <AddMemberDialog
            t={t}
            onCancel={() => setDialog(undefined)}
            onCreate={async (input) => {
              const created = await createMember(call, input);
              setDialog({ kind: 'created', created });
              await refresh();
            }}
          />
        ) : null}
        {dialog?.kind === 'created' ? (
          <InitialPasswordDialog
            t={t}
            created={dialog.created}
            urls={view.memberUrls}
            onDone={() => setDialog(undefined)}
          />
        ) : null}
      </>
    ) : null;

  if (view.viewer.kind === 'member')
    return (
      <SettingsRows rootRef={mount}>
        <SettingsSection title={t('team.account.title')}>
          <SettingsRow title={view.viewer.displayName} description={t('team.account.memberOf')} />
          <SettingsRow
            title={t('team.account.password')}
            control={
              <Button variant="outline" onClick={() => setDialog({ kind: 'own-password' })}>
                {t('team.account.changePassword')}
              </Button>
            }
          />
          <SettingsRow
            title={t('team.account.signOut')}
            control={
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setRowError(undefined);
                  signOutMember()
                    .then(() => window.location.assign(TEAM_ENTRY_PATH))
                    .catch(() => {
                      setRowError(t('team.error.generic'));
                      setBusy(false);
                    });
                }}
              >
                {t('team.account.signOutAction')}
              </Button>
            }
          />
          <SettingsRow
            title={t('team.devices.mine')}
            control={
              <Button variant="outline" onClick={() => setDialog({ kind: 'my-devices' })}>
                {t('team.devices.manage')}
              </Button>
            }
          />
          {rowError === undefined ? null : <Note tone="danger">{rowError}</Note>}
        </SettingsSection>
        {admin}
        {usage}
        {dialog?.kind === 'my-devices' ? (
          <MyDevicesDialog
            call={call}
            t={t}
            humanId={view.viewer.humanId}
            onClose={() => setDialog(undefined)}
          />
        ) : null}
        {dialog?.kind === 'own-password' ? (
          <MemberPasswordDialog
            call={call}
            t={t}
            forced={false}
            onCancel={() => setDialog(undefined)}
            onChanged={() => {
              setDialog(undefined);
              void refresh();
            }}
          />
        ) : null}
      </SettingsRows>
    );

  return (
    <SettingsRows rootRef={mount}>
      <SettingsSection>
        <SettingsRow
          title={t('team.mode.title')}
          description={t('team.mode.description')}
          data={{ 'data-team-row': 'mode' }}
          control={
            <Switch
              checked={view.enabled}
              onChange={toggleTeamMode}
              disabled={busy}
              label={t('team.mode.title')}
            />
          }
        />
        <SettingsRow
          title={t('team.ownerPassword.title')}
          description={t(
            view.ownerPasswordSet ? 'team.ownerPassword.set' : 'team.ownerPassword.unset',
          )}
          data={{ 'data-team-row': 'owner-password' }}
          control={
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDialog({ kind: 'owner-password', thenEnable: false })}
            >
              {t(view.ownerPasswordSet ? 'team.ownerPassword.change' : 'team.ownerPassword.setup')}
            </Button>
          }
        />
        {rowError === undefined ? null : <Note tone="danger">{rowError}</Note>}
      </SettingsSection>

      {view.enabled ? (
        <SettingsSection title={t('team.access.title')}>
          <SettingsRow title={t('team.access.address')} data={{ 'data-team-row': 'address' }}>
            {view.memberUrls.length === 0 ? (
              <Note>{t('team.access.noAddress')}</Note>
            ) : (
              <div {...stylex.props(styles.urls)}>
                {view.memberUrls.map((url) => (
                  <span key={url} {...stylex.props(styles.url)}>
                    {url}
                  </span>
                ))}
              </div>
            )}
          </SettingsRow>
          <SettingsRow
            title={t('team.insecureHttp.title')}
            description={t('team.insecureHttp.description')}
            data={{ 'data-team-row': 'insecure-http' }}
            control={
              <Switch
                checked={view.insecureHttpAllowed}
                onChange={toggleInsecureHttp}
                disabled={busy}
                label={t('team.insecureHttp.title')}
              />
            }
          />
          {view.insecureHttpAllowed ? (
            <Callout tone="warning" role="alert">
              {t('team.insecureHttp.warning')}
            </Callout>
          ) : null}
        </SettingsSection>
      ) : null}

      {admin}
      {usage}

      {dialog?.kind === 'owner-password' ? (
        <OwnerPasswordDialog
          t={t}
          hasPassword={view.ownerPasswordSet}
          thenEnable={dialog.thenEnable}
          onCancel={() => {
            passwordSaved.current = false;
            setDialog(undefined);
          }}
          onSubmit={async (password, current) => {
            if (!passwordSaved.current) {
              publish(await setOwnerPassword(call, password, current));
              passwordSaved.current = true;
            }
            if (dialog.thenEnable) publish(await setTeamMode(call, true));
            passwordSaved.current = false;
            setDialog(undefined);
            await refresh();
          }}
        />
      ) : null}
      {dialog?.kind === 'insecure-http' ? (
        <FormDialog
          title={t('team.insecureHttp.confirmTitle')}
          description={t('team.insecureHttp.confirmBody')}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          submitLabel={t('team.insecureHttp.confirm')}
          danger
          busy={busy}
          onCancel={() => setDialog(undefined)}
          onSubmit={() => {
            setDialog(undefined);
            void apply(() => setInsecureHttp(call, true));
          }}
        />
      ) : null}
    </SettingsRows>
  );
}

function memberMeta(
  t: BotHarnessTranslate,
  member: TeamMember,
  roles: readonly TeamRole[] = [],
): string {
  const parts = [`@${member.username}`];
  if (member.owner) {
    parts.push(t('team.members.owner'));
    return parts.join(' · ');
  }
  for (const role of roles)
    if (member.roleIds.includes(role.roleId))
      parts.push(
        role.builtin === 'admin'
          ? t('team.role.admin')
          : role.builtin === 'member'
            ? t('team.role.member')
            : role.name,
      );
  if (member.status === 'suspended') parts.push(t('team.members.suspended'));
  else if (member.mustChangePassword) parts.push(t('team.members.pendingPassword'));
  return parts.join(' · ');
}

function OwnerPasswordDialog({
  t,
  hasPassword,
  thenEnable,
  onCancel,
  onSubmit,
}: {
  t: BotHarnessTranslate;
  hasPassword: boolean;
  thenEnable: boolean;
  onCancel(): void;
  onSubmit(password: string, current: string | undefined): Promise<void>;
}): ReactElement {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const short = password.length > 0 && password.length < TEAM_PASSWORD_MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready =
    password.length >= TEAM_PASSWORD_MIN_LENGTH &&
    confirm === password &&
    (!hasPassword || current.length > 0);
  return (
    <FormDialog
      title={t(hasPassword ? 'team.ownerPassword.changeTitle' : 'team.ownerPassword.setupTitle')}
      description={t(thenEnable ? 'team.ownerPassword.enableHint' : 'team.ownerPassword.hint')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t(thenEnable ? 'team.ownerPassword.saveAndEnable' : 'team.save')}
      submitDisabled={!ready}
      busy={busy}
      error={error === undefined ? undefined : <Note tone="danger">{error}</Note>}
      onCancel={onCancel}
      onSubmit={() => {
        setBusy(true);
        setError(undefined);
        onSubmit(password, hasPassword ? current : undefined)
          .catch((failure: unknown) => setError(teamErrorText(t, failure)))
          .finally(() => setBusy(false));
      }}
    >
      <FieldStack>
        {hasPassword ? (
          <TextField
            label={t('team.password.current')}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
            initialFocus
          />
        ) : null}
        <TextField
          label={t('team.password.new')}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          initialFocus={!hasPassword}
          hint={t('team.password.rule', { min: String(TEAM_PASSWORD_MIN_LENGTH) })}
          error={short ? t('team.error.passwordWeak') : undefined}
        />
        <TextField
          label={t('team.password.confirm')}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          error={mismatch ? t('team.password.mismatch') : undefined}
        />
      </FieldStack>
    </FormDialog>
  );
}

function AddMemberDialog({
  t,
  onCancel,
  onCreate,
}: {
  t: BotHarnessTranslate;
  onCancel(): void;
  onCreate(input: { username: string; displayName: string }): Promise<void>;
}): ReactElement {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const normalized = username.trim().toLowerCase();
  const invalid = normalized.length > 0 && !validUsername(normalized);
  const ready = validUsername(normalized) && displayName.trim().length > 0;
  return (
    <FormDialog
      title={t('team.members.addTitle')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('team.members.create')}
      submitDisabled={!ready}
      busy={busy}
      error={error === undefined ? undefined : <Note tone="danger">{error}</Note>}
      onCancel={onCancel}
      onSubmit={() => {
        setBusy(true);
        setError(undefined);
        onCreate({ username: normalized, displayName: displayName.trim() }).catch(
          (failure: unknown) => {
            setError(teamErrorText(t, failure));
            setBusy(false);
          },
        );
      }}
    >
      <FieldStack>
        <TextField
          label={t('team.members.displayName')}
          value={displayName}
          onChange={setDisplayName}
          autoComplete="off"
          initialFocus
        />
        <TextField
          label={t('team.members.username')}
          value={username}
          onChange={setUsername}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          hint={t('team.members.usernameRule')}
          error={invalid ? t('team.error.usernameInvalid') : undefined}
        />
      </FieldStack>
    </FormDialog>
  );
}

function InitialPasswordDialog({
  t,
  created,
  urls,
  onDone,
}: {
  t: BotHarnessTranslate;
  created: CreatedMember;
  urls: readonly string[];
  onDone(): void;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard
      .writeText(created.initialPassword)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };
  return (
    <FormDialog
      title={t('team.members.createdTitle', { name: created.member.displayName })}
      description={t('team.members.createdHint')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('team.done')}
      showCancel={false}
      onCancel={onDone}
      onSubmit={onDone}
    >
      <dl {...stylex.props(styles.facts)}>
        <dt {...stylex.props(styles.factLabel)}>{t('team.members.username')}</dt>
        <dd {...stylex.props(styles.factValue)}>{created.member.username}</dd>
        {urls[0] === undefined ? null : (
          <>
            <dt {...stylex.props(styles.factLabel)}>{t('team.access.address')}</dt>
            <dd {...stylex.props(styles.factValue)}>{urls[0]}</dd>
          </>
        )}
      </dl>
      <div {...stylex.props(styles.secret)} data-team-initial-password="">
        <span {...stylex.props(styles.secretValue)} aria-label={t('team.members.initialPassword')}>
          {created.initialPassword}
        </span>
        <Button variant="outline" type="button" onClick={copy}>
          {t(copied ? 'team.members.copied' : 'team.members.copy')}
        </Button>
      </div>
      <Note tone="warning">{t('team.members.shownOnce')}</Note>
    </FormDialog>
  );
}

function MyDevicesDialog({
  call,
  t,
  humanId,
  onClose,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  humanId: string;
  onClose(): void;
}): ReactElement {
  const [devices, setDevices] = useState<readonly MemberDevice[]>();
  const [failed, setFailed] = useState(false);
  const load = (signal?: AbortSignal): void => {
    loadMemberDevices(call, humanId, signal)
      .then(setDevices)
      .catch(() => {
        if (signal?.aborted !== true) setFailed(true);
      });
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [call, humanId]);
  return (
    <FormDialog
      title={t('team.devices.mine')}
      size="medium"
      labels={{ close: t('common.close'), cancel: t('common.close') }}
      submitLabel=""
      showCancel={false}
      onCancel={onClose}
      onClose={onClose}
    >
      <div ref={mount}>
        {failed ? (
          <Note tone="danger">{t('team.error.generic')}</Note>
        ) : (
          <DeviceList
            call={call}
            t={t}
            humanId={humanId}
            devices={devices}
            self
            onRevoked={() => load()}
          />
        )}
      </div>
    </FormDialog>
  );
}
