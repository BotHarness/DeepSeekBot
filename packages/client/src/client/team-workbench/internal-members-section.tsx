import { useRef, useState, type ReactElement } from 'react';

import type { BridgeCall } from '../bridge.js';
import { Button } from '../ds/button.js';
import { ConfirmDialog, FormDialog } from '../ds/form-dialog.js';
import { Icon } from '../ds/icon.js';
import { IconButton } from '../ds/icon-button.js';
import { Note } from '../ds/note.js';
import { SettingsRow, SettingsSection } from '../ds/settings-row.js';
import { Switch } from '../ds/switch.js';
import { Tooltip } from '../ds/tooltip.js';
import type { BotHarnessTranslate } from '../locale.js';
import {
  createMember,
  saveMemberSettings,
  setInsecureHttp,
  setOwnerPassword,
  setTeamMode,
  type CreatedMember,
  type TeamMember,
  type TeamModeView,
} from '../team-bridge.js';
import type { PermissionEntry, TeamRole } from '../team-roles-bridge.js';
import {
  AddMemberDialog,
  InitialPasswordDialog,
  TeamOwnerPasswordDialog,
  teamErrorText,
} from '../team-settings.js';
import { setTeamModeSnapshot } from '../team-state.js';
import { EmptyDetail } from './frame.js';
import { MemberSettingsPage, type MemberSettingsPatch } from './member-settings-page.js';
import { MembersSection } from './members-section.js';
import type { Inspection } from './roles-section.js';

type Dialog =
  | { kind: 'owner-password' }
  | { kind: 'team-off' }
  | { kind: 'insecure-http' }
  | { kind: 'add-member' }
  | { kind: 'created'; created: CreatedMember };

export function InternalMembersSection({
  call,
  t,
  view,
  members,
  roles,
  catalog,
  inspected,
  pending,
  inspectError,
  onInspect,
  onChanged,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  view: TeamModeView;
  members: readonly TeamMember[];
  roles: readonly TeamRole[];
  catalog: readonly PermissionEntry[];
  inspected: Inspection | undefined;
  pending: string | undefined;
  inspectError: string | undefined;
  onInspect(member: TeamMember): void;
  onChanged(): Promise<void>;
}): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const passwordSaved = useRef(false);
  const owner = view.viewer.kind === 'owner';

  const run = async (action: () => Promise<TeamModeView | undefined>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const next = await action();
      if (next !== undefined) setTeamModeSnapshot(call, next);
      await onChanged();
    } catch (failure) {
      setError(teamErrorText(t, failure));
    } finally {
      setBusy(false);
    }
  };

  const turnOn = (): void => {
    if (!view.ownerPasswordSet) setDialog({ kind: 'owner-password' });
    else void run(() => setTeamMode(call, true));
  };

  const copyInvite = (): void => {
    const url = view.memberUrls[0];
    if (url === undefined) return;
    void navigator.clipboard
      .writeText(url)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  const dialogs = (
    <>
      {dialog?.kind === 'owner-password' ? (
        <TeamOwnerPasswordDialog
          t={t}
          hasPassword={view.ownerPasswordSet}
          thenEnable
          onCancel={() => {
            passwordSaved.current = false;
            setDialog(undefined);
          }}
          onSubmit={async (password, current, signOutOthers) => {
            if (!passwordSaved.current) {
              setTeamModeSnapshot(
                call,
                await setOwnerPassword(call, password, current, signOutOthers),
              );
              passwordSaved.current = true;
            }
            setTeamModeSnapshot(call, await setTeamMode(call, true));
            passwordSaved.current = false;
            setDialog(undefined);
            await onChanged();
          }}
        />
      ) : null}
      {dialog?.kind === 'team-off' ? (
        <ConfirmDialog
          title={t('team.mode.offTitle')}
          description={t('team.mode.offBody')}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t('team.mode.offConfirm')}
          danger
          busy={busy}
          onCancel={() => setDialog(undefined)}
          onConfirm={() => {
            setDialog(undefined);
            setSettingsOpen(false);
            void run(() => setTeamMode(call, false));
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
            void run(() => setInsecureHttp(call, true));
          }}
        />
      ) : null}
      {dialog?.kind === 'add-member' ? (
        <AddMemberDialog
          t={t}
          onCancel={() => setDialog(undefined)}
          onCreate={async (input) => {
            const created = await createMember(call, input);
            setDialog({ kind: 'created', created });
            await onChanged();
          }}
        />
      ) : null}
      {dialog?.kind === 'created' ? (
        <InitialPasswordDialog
          call={call}
          t={t}
          created={dialog.created}
          urls={view.memberUrls}
          isolation={view.isolation}
          onDone={() => setDialog(undefined)}
        />
      ) : null}
    </>
  );

  if (!view.enabled)
    return (
      <>
        <EmptyDetail
          icon="users"
          data={{ 'data-team-members-off': '' }}
          action={
            <SettingsSection>
              <SettingsRow
                title={t('team.mode.title')}
                description={t('team.workbench.membersOff')}
                data={{ 'data-team-row': 'mode' }}
                control={
                  <Switch
                    checked={false}
                    onChange={(next) => {
                      if (next) turnOn();
                    }}
                    disabled={busy || !owner}
                    label={t('team.mode.title')}
                  />
                }
              />
              {error === undefined ? null : <Note tone="danger">{error}</Note>}
            </SettingsSection>
          }
        >
          {t('team.workbench.membersOffBody')}
        </EmptyDetail>
        {dialogs}
      </>
    );

  const settingsLabel = t('team.workbench.memberSettings');
  const noAddress = view.memberUrls.length === 0;
  return (
    <>
      <MembersSection
        t={t}
        members={members}
        roles={roles}
        catalog={catalog}
        inspected={inspected}
        pending={pending}
        error={inspectError}
        action={
          <Tooltip label={settingsLabel}>
            <IconButton
              aria-label={settingsLabel}
              aria-pressed={settingsOpen}
              data-team-member-settings-open=""
              onClick={() => {
                setError(undefined);
                setSettingsOpen((open) => !open);
              }}
            >
              <Icon name="settings" />
            </IconButton>
          </Tooltip>
        }
        toolbar={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Icon name="link" />}
              disabled={noAddress}
              data-team-copy-invite=""
              onClick={copyInvite}
            >
              {t(copied ? 'team.members.copied' : 'team.workbench.copyInvite')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Icon name="user-plus" />}
              disabled={busy}
              data-team-invite-member=""
              onClick={() => setDialog({ kind: 'add-member' })}
            >
              {t('team.workbench.inviteMember')}
            </Button>
            {noAddress ? <Note>{t('team.access.noAddress')}</Note> : null}
          </>
        }
        aside={
          settingsOpen ? (
            <MemberSettingsPage
              t={t}
              view={view}
              roles={roles}
              busy={busy}
              error={error}
              onBack={() => setSettingsOpen(false)}
              onInsecureHttp={(allowed) => {
                if (allowed) setDialog({ kind: 'insecure-http' });
                else void run(() => setInsecureHttp(call, false));
              }}
              onSave={(patch: MemberSettingsPatch) =>
                void run(async () => {
                  await saveMemberSettings(call, patch);
                  return undefined;
                })
              }
              onTurnOff={() => setDialog({ kind: 'team-off' })}
            />
          ) : undefined
        }
        onInspect={(member) => {
          setSettingsOpen(false);
          onInspect(member);
        }}
      />
      {dialogs}
    </>
  );
}
