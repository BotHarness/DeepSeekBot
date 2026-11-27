import { Fragment, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { Note } from '../ds/note.js';
import { SettingsRow, SettingsSection } from '../ds/settings-row.js';
import { Tag } from '../ds/tag.js';
import { space } from '../ds/tobs.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from '../locale.js';
import type { TeamMember } from '../team-bridge.js';
import { hasConflict, type MemberPermissions, type PermissionEntry } from '../team-roles-bridge.js';
import { permissionLabel } from '../team-roles.js';
import { GroupCaption } from './group-caption.js';
import { groupCatalog, groupTitle, sourceName } from './permission-model.js';

const styles = stylex.create({
  sources: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space.x2,
  },
});

export function EffectivePermissions({
  t,
  catalog,
  member,
  result,
}: {
  t: BotHarnessTranslate;
  catalog: readonly PermissionEntry[];
  member: TeamMember;
  result: MemberPermissions;
}): ReactElement {
  const byId = new Map(result.permissions.map((entry) => [entry.id, entry]));
  return (
    <SettingsSection
      title={t('team.workbench.effective', { name: member.displayName })}
      description={result.owner ? undefined : t('team.workbench.denyWins')}
      data={{ 'data-team-effective': member.username }}
    >
      {result.owner ? <Note>{t('team.owner.noRoles')}</Note> : null}
      {result.owner
        ? null
        : groupCatalog(catalog).map(([group, ids]) => (
            <Fragment key={group}>
              <GroupCaption>{groupTitle(t, group)}</GroupCaption>
              {ids.map((id) => {
                const entry = byId.get(id);
                if (entry === undefined) return null;
                return (
                  <SettingsRow
                    key={id}
                    title={permissionLabel(t, id)}
                    data={{ 'data-team-effective-permission': id, 'data-state': entry.state }}
                    control={
                      <span {...stylex.props(styles.sources)}>
                        {hasConflict(entry) ? (
                          <Tag tone="warning">{t('team.workbench.conflict')}</Tag>
                        ) : null}
                        {entry.sources.map((source) => (
                          <Tag
                            key={source.roleId}
                            tone={source.effect === 'deny' ? 'danger' : 'neutral'}
                          >
                            {t(
                              source.effect === 'deny'
                                ? 'team.workbench.sourceDeny'
                                : 'team.workbench.sourceAllow',
                              { role: sourceName(t, source) },
                            )}
                          </Tag>
                        ))}
                        <Tag tone={entry.state === 'granted' ? 'success' : 'neutral'}>
                          {t(`team.workbench.state.${entry.state}` as BotHarnessKey)}
                        </Tag>
                      </span>
                    }
                  />
                );
              })}
            </Fragment>
          ))}
    </SettingsSection>
  );
}
