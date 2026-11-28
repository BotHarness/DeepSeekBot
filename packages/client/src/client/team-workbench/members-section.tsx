import { useState, type ReactElement, type ReactNode } from 'react';

import { Icon } from '../ds/icon.js';
import { NavItem } from '../ds/nav-item.js';
import { Note } from '../ds/note.js';
import { PanelEmptyState } from '../ds/empty-state.js';
import { SettingsRow, SettingsSection } from '../ds/settings-row.js';
import { Tag } from '../ds/tag.js';
import type { BotHarnessTranslate } from '../locale.js';
import type { TeamMember } from '../team-bridge.js';
import type { PermissionEntry, TeamRole } from '../team-roles-bridge.js';
import { roleLabel } from '../team-roles.js';
import { EffectivePermissions } from './effective-permissions.js';
import { DetailColumn, EmptyDetail, ListColumn, PanelGap } from './frame.js';
import type { Inspection } from './roles-section.js';

function memberRoles(t: BotHarnessTranslate, member: TeamMember, roles: readonly TeamRole[]) {
  if (member.owner) return [t('team.workbench.owner')];
  return member.roleIds.map((roleId) => {
    const role = roles.find((item) => item.roleId === roleId);
    return role === undefined ? roleId : roleLabel(t, role);
  });
}

export function MembersSection({
  t,
  members,
  roles,
  catalog,
  inspected,
  pending,
  error,
  action,
  toolbar,
  aside,
  onInspect,
}: {
  t: BotHarnessTranslate;
  members: readonly TeamMember[];
  roles: readonly TeamRole[];
  catalog: readonly PermissionEntry[];
  inspected: Inspection | undefined;
  pending?: string | undefined;
  error: string | undefined;
  action?: ReactNode;
  toolbar?: ReactNode;
  aside?: ReactNode;
  onInspect(member: TeamMember): void;
}): ReactElement {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string>();
  const needle = query.trim().toLocaleLowerCase();
  const shown = members.filter(
    (member) =>
      needle === '' ||
      member.displayName.toLocaleLowerCase().includes(needle) ||
      member.username.toLocaleLowerCase().includes(needle),
  );
  const member = aside === undefined ? members.find((item) => item.humanId === picked) : undefined;
  const select = (next: TeamMember): void => {
    setPicked(next.humanId);
    onInspect(next);
  };
  return (
    <>
      <ListColumn
        title={t('team.workbench.members')}
        count={members.length}
        action={action}
        toolbar={toolbar}
        search={{ label: t('team.workbench.searchMembers'), value: query, onChange: setQuery }}
        status={
          members.length === 0 ? (
            <PanelEmptyState icon="users">{t('team.workbench.noMembers')}</PanelEmptyState>
          ) : shown.length === 0 ? (
            <Note>{t('team.workbench.noMatch')}</Note>
          ) : undefined
        }
      >
        {shown.map((item) => (
          <li key={item.humanId}>
            <NavItem
              icon={<Icon name="user" />}
              label={item.displayName}
              description={memberRoles(t, item, roles).join(' · ')}
              multiline
              current={item.humanId === member?.humanId}
              data={{ 'data-team-member': item.username }}
              onSelect={() => select(item)}
            />
          </li>
        ))}
      </ListColumn>
      <PanelGap />
      {aside !== undefined ? (
        aside
      ) : member === undefined ? (
        <EmptyDetail icon="user">{t('team.workbench.pickMember')}</EmptyDetail>
      ) : (
        <DetailColumn
          icon={<Icon name="user" />}
          title={member.displayName}
          meta={
            <>
              <Tag tone="quiet">{member.username}</Tag>
              {member.status === 'active' ? null : (
                <Tag tone="warning">
                  {t(
                    member.status === 'suspended'
                      ? 'team.members.suspended'
                      : 'team.members.deactivated',
                  )}
                </Tag>
              )}
            </>
          }
          data={{ 'data-team-member-detail': member.username }}
        >
          {error === undefined ? null : <Note tone="danger">{error}</Note>}
          <SettingsSection title={t('team.workbench.memberRoles')}>
            <SettingsRow
              title={t('team.workbench.internalRoles')}
              control={memberRoles(t, member, roles).map((name) => (
                <Tag key={name} tone="info">
                  {name}
                </Tag>
              ))}
            />
          </SettingsSection>
          {pending === member.humanId ? <Note>{t('team.workbench.loading')}</Note> : null}
          {inspected?.member.humanId === member.humanId ? (
            <EffectivePermissions
              t={t}
              catalog={catalog}
              member={inspected.member}
              result={inspected.result}
            />
          ) : null}
        </DetailColumn>
      )}
    </>
  );
}
