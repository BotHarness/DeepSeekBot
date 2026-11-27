import { useId, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type {
  ExternalRoleBotScope,
  HostExternalRole,
} from '@botharness/host-client/external-roles';
import { Button } from '../ds/button.js';
import { Checkbox } from '../ds/checkbox.js';
import { TextField } from '../ds/field.js';
import { FormDialog } from '../ds/form-dialog.js';
import { Note } from '../ds/note.js';
import { SegmentedControl } from '../ds/segmented.js';
import { ink, space, type } from '../ds/tobs.stylex.js';
import type { BotHarnessTranslate } from '../locale.js';
import type { BotEntry } from './external-roles-section.js';

const NAME_LIMIT = 80;

const styles = stylex.create({
  group: { display: 'flex', flexDirection: 'column', gap: space.x3 },
  label: {
    margin: 0,
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
    fontWeight: type.labelWeight,
  },
  bots: { display: 'flex', flexDirection: 'column', gap: space.x3 },
});

export interface ExternalRoleDraft {
  readonly name: string;
  readonly botScope: ExternalRoleBotScope;
}

export function ExternalRoleDialog({
  t,
  role,
  bots,
  busy,
  error,
  onReload,
  onCancel,
  onSubmit,
}: {
  t: BotHarnessTranslate;
  role: HostExternalRole | undefined;
  bots: readonly BotEntry[];
  busy: boolean;
  error: string | undefined;
  onCancel(): void;
  onReload?: (() => void) | undefined;
  onSubmit(draft: ExternalRoleDraft): void;
}): ReactElement {
  const scopeId = useId();
  const [name, setName] = useState(role?.name ?? '');
  const [kind, setKind] = useState<ExternalRoleBotScope['kind']>('only');
  const [picked, setPicked] = useState<readonly string[]>([]);
  const trimmed = name.trim();
  const botScope: ExternalRoleBotScope =
    kind === 'all' ? { kind: 'all' } : { kind: 'only', botSlugs: [...picked] };
  return (
    <FormDialog
      title={
        role === undefined
          ? t('team.externalRoles.newTitle')
          : t('team.externalRoles.renameTitle', { name: role.name })
      }
      size="medium"
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={role === undefined ? t('team.externalRoles.create') : t('team.save')}
      submitDisabled={trimmed.length === 0 || trimmed === role?.name || onReload !== undefined}
      secondary={
        onReload === undefined ? undefined : (
          <Button
            variant="outline"
            disabled={busy}
            data-external-role-dialog-reload=""
            onClick={onReload}
          >
            {t('team.roles.reload')}
          </Button>
        )
      }
      submitData={{ 'data-external-role-submit': '' }}
      busy={busy}
      error={error === undefined ? undefined : <Note tone="danger">{error}</Note>}
      onCancel={onCancel}
      onSubmit={() => onSubmit({ name: trimmed, botScope })}
    >
      <TextField
        label={t('team.externalRoles.name')}
        value={name}
        onChange={setName}
        maxLength={NAME_LIMIT}
        disabled={busy}
        initialFocus
        data-external-role-name=""
      />
      {role === undefined ? (
        <div {...stylex.props(styles.group)}>
          <p {...stylex.props(styles.label)}>{t('team.externalRoles.bots')}</p>
          <SegmentedControl<ExternalRoleBotScope['kind']>
            id={scopeId}
            label={t('team.externalRoles.bots')}
            value={kind}
            disabled={busy}
            options={[
              { value: 'only', label: t('team.externalRoles.scope.only') },
              { value: 'all', label: t('team.externalRoles.scope.all') },
            ]}
            onChange={setKind}
          />
          {kind === 'all' ? (
            <Note>{t('team.externalRoles.scope.allHint')}</Note>
          ) : (
            <div {...stylex.props(styles.bots)} data-external-role-dialog-bots="">
              {bots.map((bot) => (
                <Checkbox
                  key={bot.slug}
                  label={bot.name}
                  checked={picked.includes(bot.slug)}
                  disabled={busy}
                  onChange={(checked) =>
                    setPicked((current) =>
                      checked
                        ? [...current.filter((slug) => slug !== bot.slug), bot.slug]
                        : current.filter((slug) => slug !== bot.slug),
                    )
                  }
                />
              ))}
              {picked.length === 0 ? <Note>{t('team.externalRoles.scope.noneHint')}</Note> : null}
            </div>
          )}
        </div>
      ) : null}
    </FormDialog>
  );
}
