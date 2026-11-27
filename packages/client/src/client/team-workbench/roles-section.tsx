import { Fragment, useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '../ds/button.js';
import { Icon } from '../ds/icon.js';
import { NavItem } from '../ds/nav-item.js';
import { Note } from '../ds/note.js';
import { SegmentedControl } from '../ds/segmented.js';
import { SettingsRow, SettingsSection } from '../ds/settings-row.js';
import { Tag } from '../ds/tag.js';
import type { BotHarnessTranslate } from '../locale.js';
import type { TeamMember, TeamModeView } from '../team-bridge.js';
import {
  MANAGE_MEMBERS,
  canManage,
  type MemberPermissions,
  type PermissionEntry,
  type TeamRole,
} from '../team-roles-bridge.js';
import { permissionLabel, roleLabel } from '../team-roles.js';
import { EffectivePermissions } from './effective-permissions.js';
import { DetailColumn, EmptyDetail, ListColumn, PanelGap } from './frame.js';
import { GroupCaption } from './group-caption.js';
import {
  HIGH_RISK,
  choiceOf,
  groupCatalog,
  groupTitle,
  lockReason,
  optionalText,
  type PermissionChoice,
} from './permission-model.js';

export function roleIcon(role: TeamRole): string {
  return role.builtin === null ? 'users' : 'shield-check';
}

export interface Inspection {
  readonly member: TeamMember;
  readonly result: MemberPermissions;
}

export function RolesSection({
  t,
  view,
  roles,
  catalog,
  members,
  selected,
  busy,
  error,
  inspectError,
  pending,
  notice,
  inspected,
  botScope,
  onSelect,
  onChoose,
  onInspect,
}: {
  t: BotHarnessTranslate;
  view: TeamModeView;
  roles: readonly TeamRole[];
  catalog: readonly PermissionEntry[];
  members: readonly TeamMember[];
  selected: string | undefined;
  busy: boolean;
  error: string | undefined;
  inspectError?: string | undefined;
  pending?: string | undefined;
  notice?: ReactNode;
  inspected: Inspection | undefined;
  botScope?(role: TeamRole): ReactNode;
  onSelect(roleId: string): void;
  onChoose(role: TeamRole, id: string, choice: PermissionChoice): void;
  onInspect(member: TeamMember): void;
}): ReactElement {
  const [query, setQuery] = useState('');
  const role = roles.find((item) => item.roleId === selected) ?? roles[0];
  const needle = query.trim().toLocaleLowerCase();
  const shown = roles.filter(
    (item) => needle === '' || roleLabel(t, item).toLocaleLowerCase().includes(needle),
  );
  return (
    <>
      <ListColumn
        title={t('team.workbench.internalRoles')}
        count={roles.length}
        search={{ label: t('team.workbench.searchRoles'), value: query, onChange: setQuery }}
        status={
          roles.length > 0 && shown.length === 0 ? (
            <Note>{t('team.workbench.noMatch')}</Note>
          ) : undefined
        }
      >
        {shown.map((item) => (
          <li key={item.roleId}>
            <NavItem
              icon={<Icon name={roleIcon(item)} />}
              label={roleLabel(t, item)}
              description={t('team.workbench.roleSummary', {
                people: item.memberCount,
                allow: item.permissions.length,
                deny: item.denied.length,
              })}
              multiline
              current={item.roleId === role?.roleId}
              data={{ 'data-team-role': item.roleId }}
              onSelect={() => onSelect(item.roleId)}
            />
          </li>
        ))}
      </ListColumn>
      <PanelGap />
      {role === undefined ? (
        <EmptyDetail icon="lock">{t('team.workbench.noRoles')}</EmptyDetail>
      ) : (
        <DetailColumn
          icon={<Icon name={roleIcon(role)} />}
          title={roleLabel(t, role)}
          meta={
            <>
              {role.builtin === null ? null : <Tag>{t('team.workbench.builtin')}</Tag>}
              <Tag tone="quiet">{t('team.workbench.people', { people: role.memberCount })}</Tag>
            </>
          }
          data={{ 'data-team-role-detail': role.roleId }}
        >
          {notice}
          {error === undefined ? null : <Note tone="danger">{error}</Note>}
          <SettingsSection
            title={t('team.workbench.capabilities')}
            description={t('team.workbench.denyWins')}
            action={<Tag tone="info">{t('team.workbench.enforced')}</Tag>}
          >
            {groupCatalog(catalog).map(([group, ids]) => (
              <Fragment key={group}>
                <GroupCaption data={{ 'data-team-capability-group': group }}>
                  {groupTitle(t, group)}
                </GroupCaption>
                {ids.map((id) => (
                  <Capability
                    key={id}
                    t={t}
                    view={view}
                    role={role}
                    id={id}
                    busy={busy}
                    onChange={(choice) => onChoose(role, id, choice)}
                  />
                ))}
              </Fragment>
            ))}
          </SettingsSection>
          {botScope?.(role)}
          {canManage(view.viewer, MANAGE_MEMBERS) ? (
            <Holders
              t={t}
              holders={members.filter((member) => member.roleIds.includes(role.roleId))}
              inspected={inspected?.member.humanId}
              onInspect={onInspect}
            />
          ) : null}
          {inspectError === undefined ? null : <Note tone="danger">{inspectError}</Note>}
          {pending === undefined ? null : <Note>{t('team.workbench.loading')}</Note>}
          {inspected === undefined ? null : (
            <EffectivePermissions
              t={t}
              catalog={catalog}
              member={inspected.member}
              result={inspected.result}
            />
          )}
        </DetailColumn>
      )}
    </>
  );
}

function Capability({
  t,
  view,
  role,
  id,
  busy,
  onChange,
}: {
  t: BotHarnessTranslate;
  view: TeamModeView;
  role: TeamRole;
  id: string;
  busy: boolean;
  onChange(choice: PermissionChoice): void;
}): ReactElement {
  const label = permissionLabel(t, id);
  const locked = lockReason(t, view, role, id);
  return (
    <SettingsRow
      title={
        HIGH_RISK.has(id) ? (
          <>
            {label} <Tag tone="warning">{t('team.workbench.risk')}</Tag>
          </>
        ) : (
          label
        )
      }
      description={locked ?? optionalText(t, `team.permission.${id}.hint`)}
      data={{ 'data-team-capability': id }}
      control={
        <SegmentedControl<PermissionChoice>
          id={`team-capability-${role.roleId}-${id}`}
          label={label}
          value={choiceOf(role, id)}
          disabled={busy || locked !== undefined}
          options={[
            { value: 'allow', label: t('team.workbench.allow') },
            { value: 'unset', label: t('team.workbench.unset') },
            { value: 'deny', label: t('team.workbench.deny') },
          ]}
          onChange={onChange}
        />
      }
    />
  );
}

function Holders({
  t,
  holders,
  inspected,
  onInspect,
}: {
  t: BotHarnessTranslate;
  holders: readonly TeamMember[];
  inspected: string | undefined;
  onInspect(member: TeamMember): void;
}): ReactElement {
  return (
    <SettingsSection title={t('team.workbench.holders')}>
      {holders.length === 0 ? (
        <SettingsRow title={t('team.workbench.noHolders')} />
      ) : (
        holders.map((member) => (
          <SettingsRow
            key={member.humanId}
            icon={<Icon name="user" />}
            title={member.displayName}
            description={member.username}
            control={
              <Button
                size="sm"
                variant="outline"
                aria-pressed={inspected === member.humanId}
                aria-label={`${member.displayName} · ${t('team.workbench.inspect')}`}
                data-team-holder={member.username}
                onClick={() => onInspect(member)}
              >
                {t('team.workbench.inspect')}
              </Button>
            }
          />
        ))
      )}
    </SettingsSection>
  );
}
