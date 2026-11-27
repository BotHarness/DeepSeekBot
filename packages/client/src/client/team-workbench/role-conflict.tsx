import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { Button } from '../ds/button.js';
import { Note } from '../ds/note.js';
import { space } from '../ds/tobs.stylex.js';
import type { BotHarnessTranslate } from '../locale.js';
import { permissionLabel } from '../team-roles.js';
import type { PermissionChoice } from './permission-model.js';

const styles = stylex.create({
  body: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: space.x2 },
});

export interface RoleConflict {
  readonly roleId: string;
  readonly id: string;
  readonly choice: PermissionChoice;
  readonly reloaded: boolean;
}

const CHOICE_LABEL = {
  allow: 'team.workbench.allow',
  unset: 'team.workbench.unset',
  deny: 'team.workbench.deny',
} as const;

export function RoleConflictNote({
  t,
  conflict,
  busy,
  onReload,
}: {
  t: BotHarnessTranslate;
  conflict: RoleConflict;
  busy: boolean;
  onReload(): void;
}): ReactElement {
  const change = t('team.workbench.unsavedChange', {
    permission: permissionLabel(t, conflict.id),
    choice: t(CHOICE_LABEL[conflict.choice]),
  });
  return (
    <Note tone={conflict.reloaded ? 'muted' : 'warning'}>
      <span
        {...stylex.props(styles.body)}
        data-team-role-conflict={conflict.reloaded ? 'reloaded' : 'stale'}
      >
        <span>{t(conflict.reloaded ? 'team.roles.reloaded' : 'team.error.staleRole')}</span>
        <span>{change}</span>
        {conflict.reloaded ? null : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            data-team-role-reload=""
            onClick={onReload}
          >
            {t('team.roles.reload')}
          </Button>
        )}
      </span>
    </Note>
  );
}
