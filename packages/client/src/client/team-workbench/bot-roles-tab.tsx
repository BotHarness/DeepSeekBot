import type { ReactElement } from 'react';

import type { BotAccessRolesView } from '@botharness/host-client/team-roles';
import { PanelEmptyState } from '../ds/empty-state.js';
import { Icon } from '../ds/icon.js';
import { Note } from '../ds/note.js';
import { SettingsRow, SettingsSection } from '../ds/settings-row.js';
import { Tag } from '../ds/tag.js';
import type { BotHarnessTranslate } from '../locale.js';
import type { TeamRole } from '../team-roles-bridge.js';
import { roleLabel } from '../team-roles.js';

const SOURCE_LABEL = {
  everyone: 'team.workbench.bots.source.everyone',
  all: 'team.workbench.bots.source.all',
  selected: 'team.workbench.bots.source.selected',
} as const;

const SOURCE_HINT = {
  everyone: 'team.workbench.bots.source.everyone.hint',
  all: 'team.workbench.bots.source.all.hint',
  selected: 'team.workbench.bots.source.selected.hint',
} as const;

const SOURCE_TONE = { everyone: 'quiet', all: 'info', selected: 'neutral' } as const;

export function BotRolesTab({
  t,
  access,
  roles,
}: {
  t: BotHarnessTranslate;
  access: BotAccessRolesView;
  roles: readonly TeamRole[];
}): ReactElement {
  if (access.audience === 'private')
    return <PanelEmptyState icon="lock">{t('team.workbench.bots.privateNote')}</PanelEmptyState>;
  const name = (roleId: string, fallback: string): string => {
    const role = roles.find((item) => item.roleId === roleId);
    return role === undefined ? fallback : roleLabel(t, role);
  };
  return (
    <>
      {access.availableToMembers ? null : (
        <Note tone="warning">{t('team.workbench.bots.unavailable')}</Note>
      )}
      <SettingsSection title={t('team.workbench.bots.roles')}>
        {access.roles.length === 0 ? (
          <SettingsRow title={t('team.workbench.bots.noRoles')} />
        ) : (
          access.roles.map((role) => (
            <SettingsRow
              key={role.roleId}
              icon={<Icon name="users" />}
              title={name(role.roleId, role.name)}
              description={t(SOURCE_HINT[role.source])}
              data={{ 'data-team-bot-role': role.roleId, 'data-team-bot-role-source': role.source }}
              control={<Tag tone={SOURCE_TONE[role.source]}>{t(SOURCE_LABEL[role.source])}</Tag>}
            />
          ))
        )}
      </SettingsSection>
      {access.audience === 'members' ? (
        <SettingsSection title={t('team.workbench.bots.invited')}>
          {access.invitedMembers.length === 0 ? (
            <SettingsRow title={t('team.workbench.bots.noInvited')} />
          ) : (
            access.invitedMembers.map((member) => (
              <SettingsRow
                key={member.humanId}
                icon={<Icon name="user" />}
                title={member.displayName}
                data={{ 'data-team-bot-invitee': member.humanId }}
              />
            ))
          )}
        </SettingsSection>
      ) : null}
    </>
  );
}
