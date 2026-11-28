import { useState, type ReactElement } from 'react';
import { TEAM_INVITATION_LIFETIME } from '@botharness/host-protocol/team-member-settings';

import { Button } from '../ds/button.js';
import { Callout } from '../ds/callout.js';
import { Note } from '../ds/note.js';
import { NumberField } from '../ds/number-field.js';
import { Select } from '../ds/select.js';
import { SettingsRow, SettingsSection } from '../ds/settings-row.js';
import { Switch } from '../ds/switch.js';
import type { BotHarnessTranslate } from '../locale.js';
import type { TeamModeView } from '../team-bridge.js';
import { MANAGE_MEMBERS, canManage, type TeamRole } from '../team-roles-bridge.js';
import { roleLabel } from '../team-roles.js';
import { DetailColumn } from './frame.js';

const TEAM_SETTINGS = 'team.settings';

export interface MemberSettingsPatch {
  readonly inviteLifetimeMinutes?: number;
  readonly defaultRoleId?: string;
}

export function MemberSettingsPage({
  t,
  view,
  roles,
  busy,
  error,
  onBack,
  onInsecureHttp,
  onSave,
  onTurnOff,
}: {
  t: BotHarnessTranslate;
  view: TeamModeView;
  roles: readonly TeamRole[];
  busy: boolean;
  error: string | undefined;
  onBack(): void;
  onInsecureHttp(allowed: boolean): void;
  onSave(patch: MemberSettingsPatch): void;
  onTurnOff(): void;
}): ReactElement {
  const owner = view.viewer.kind === 'owner';
  const settings = view.memberSettings;
  const canEdit = canManage(view.viewer, TEAM_SETTINGS);
  const canPickRole = canEdit && canManage(view.viewer, MANAGE_MEMBERS);
  const roleOptions = roles.map((role) => ({ value: role.roleId, label: roleLabel(t, role) }));
  if (settings !== undefined && !roles.some((role) => role.roleId === settings.defaultRoleId))
    roleOptions.push({ value: settings.defaultRoleId, label: settings.defaultRoleId });
  return (
    <DetailColumn
      title={t('team.workbench.memberSettings')}
      back={{ label: t('team.workbench.back'), onBack }}
      data={{ 'data-team-member-settings': '' }}
    >
      {error === undefined ? null : <Note tone="danger">{error}</Note>}
      <SettingsSection title={t('team.access.title')}>
        <SettingsRow
          title={t('team.insecureHttp.title')}
          description={t('team.insecureHttp.description')}
          data={{ 'data-team-row': 'insecure-http' }}
          control={
            <Switch
              checked={view.insecureHttpAllowed}
              onChange={onInsecureHttp}
              disabled={busy || !owner}
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
      <SettingsSection title={t('team.memberSettings.invite')}>
        {settings === undefined ? (
          <Note>{t('team.memberSettings.unavailable')}</Note>
        ) : (
          <>
            <SettingsRow
              title={t('team.memberSettings.lifetime')}
              description={t('team.memberSettings.lifetimeHint')}
              data={{ 'data-team-row': 'invite-lifetime' }}
              control={
                <NumberField
                  label={t('team.memberSettings.lifetime')}
                  value={settings.inviteLifetimeMinutes}
                  min={TEAM_INVITATION_LIFETIME.min}
                  max={TEAM_INVITATION_LIFETIME.max}
                  unit={t('team.memberSettings.minutes')}
                  disabled={busy || !canEdit}
                  data={{ 'data-team-invite-lifetime': '' }}
                  onCommit={(minutes) => onSave({ inviteLifetimeMinutes: minutes })}
                />
              }
            />
            <SettingsRow
              title={t('team.memberSettings.defaultRole')}
              description={t('team.memberSettings.defaultRoleHint')}
              data={{ 'data-team-row': 'default-role' }}
              control={
                <Select
                  label={t('team.memberSettings.defaultRole')}
                  value={settings.defaultRoleId}
                  options={roleOptions}
                  disabled={busy || !canPickRole}
                  onChange={(roleId) => {
                    if (roleId !== settings.defaultRoleId) onSave({ defaultRoleId: roleId });
                  }}
                />
              }
            />
          </>
        )}
      </SettingsSection>
      <SettingsSection title={t('team.memberSettings.isolation')}>
        <Note tone={view.isolation === 'trial' ? 'warning' : 'muted'}>
          {t(view.isolation === 'trial' ? 'team.isolation.trial' : 'team.isolation.enforced')}
        </Note>
      </SettingsSection>
      <SettingsSection title={t('team.mode.title')}>
        <SettingsRow
          title={t('team.memberSettings.turnOff')}
          description={t('team.memberSettings.turnOffHint')}
          data={{ 'data-team-row': 'mode' }}
          control={
            <Button
              variant="outline"
              disabled={busy || !owner}
              data-team-mode-off=""
              onClick={onTurnOff}
            >
              {t('team.memberSettings.turnOffAction')}
            </Button>
          }
        />
      </SettingsSection>
    </DetailColumn>
  );
}
