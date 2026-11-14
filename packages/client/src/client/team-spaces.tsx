import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeCall } from './bridge.js';
import { Field, FieldStack, TextField } from './ds/field.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { TeamMember } from './team-bridge.js';
import type { TeamRole } from './team-roles-bridge.js';
import { roleLabel } from './team-roles.js';
import { teamErrorText } from './team-settings.js';
import { audienceSummary } from './team-spaces-view.js';
import {
  audienceReady,
  createSpace,
  deleteSpace,
  loadSpaces,
  updateSpace,
  type SpaceAudience,
  type TeamSpace,
} from './team-spaces-bridge.js';

const styles = stylex.create({
  checks: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
});

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; spaces: readonly TeamSpace[] };

export function SpacesSection({
  call,
  t,
  canManageShared,
  roles,
  members,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  canManageShared: boolean;
  roles: readonly TeamRole[];
  members: readonly TeamMember[];
}): ReactElement {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [editing, setEditing] = useState<TeamSpace | 'new'>();
  const [revision, setRevision] = useState(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    loadSpaces(call, controller.signal)
      .then((spaces) => {
        if (!controller.signal.aborted) setLoad({ state: 'ready', spaces });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: 'failed' });
      });
    return () => controller.abort();
  }, [call, revision]);
  const spaces = load.state === 'ready' ? load.spaces : [];
  const own = spaces.find((item) => item.kind === 'account');
  const shared = spaces.filter((item) => item.kind === 'shared');
  return (
    <SettingsSection title={t('team.spaces.title')}>
      <div ref={mount}>
        {load.state === 'failed' ? <Note tone="danger">{t('team.spaces.loadFailed')}</Note> : null}
        {own === undefined ? null : (
          <SettingsRow
            title={t('team.spaces.yours')}
            description={t('team.spaces.yoursHint')}
            data={{ 'data-team-space': 'account' }}
          />
        )}
        <SettingsRow
          title={t('team.spaces.shared')}
          data={{ 'data-team-row': 'shared-spaces' }}
          control={
            canManageShared ? (
              <Button variant="outline" onClick={() => setEditing('new')}>
                {t('team.spaces.new')}
              </Button>
            ) : undefined
          }
        />
        {shared.length === 0 && load.state === 'ready' ? (
          <Note>{t('team.spaces.sharedEmpty')}</Note>
        ) : null}
        <div role="list" aria-label={t('team.spaces.shared')}>
          {shared.map((item) => (
            <div role="listitem" key={item.spaceId} data-team-space={item.spaceId}>
              <SettingsRow
                title={item.name}
                description={audienceSummary(t, item.audience, roles, members)}
                control={
                  item.canManage ? (
                    <Button
                      variant="outline"
                      aria-label={t('team.spaces.editNamed', { name: item.name })}
                      onClick={() => setEditing(item)}
                    >
                      {t('team.spaces.edit')}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ))}
        </div>
      </div>
      {editing === undefined ? null : (
        <SpaceDialog
          call={call}
          t={t}
          space={editing === 'new' ? undefined : editing}
          roles={roles}
          members={members}
          onCancel={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setRevision((value) => value + 1);
          }}
        />
      )}
    </SettingsSection>
  );
}

function SpaceDialog({
  call,
  t,
  space: current,
  roles,
  members,
  onCancel,
  onSaved,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  space: TeamSpace | undefined;
  roles: readonly TeamRole[];
  members: readonly TeamMember[];
  onCancel(): void;
  onSaved(): void;
}): ReactElement {
  const [name, setName] = useState(current?.name ?? '');
  const [audience, setAudience] = useState<SpaceAudience>(
    current?.audience ?? { kind: 'everyone' },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  const errorNote = error === undefined ? undefined : <Note tone="danger">{error}</Note>;
  if (confirmDelete && current !== undefined)
    return (
      <ConfirmDialog
        title={t('team.spaces.deleteTitle', { name: current.name })}
        description={t('team.spaces.deleteBody')}
        labels={{ close: t('common.close'), cancel: t('common.cancel') }}
        confirmLabel={t('common.delete')}
        danger
        busy={busy}
        error={errorNote}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => run(() => deleteSpace(call, current.spaceId))}
      />
    );
  const toggle = (id: string, on: boolean): void => {
    if (audience.kind === 'roles') {
      const next = new Set(audience.roleIds);
      if (on) next.add(id);
      else next.delete(id);
      setAudience({ kind: 'roles', roleIds: [...next] });
    } else if (audience.kind === 'members') {
      const next = new Set(audience.humanIds);
      if (on) next.add(id);
      else next.delete(id);
      setAudience({ kind: 'members', humanIds: [...next] });
    }
  };
  const chosen =
    audience.kind === 'roles'
      ? audience.roleIds
      : audience.kind === 'members'
        ? audience.humanIds
        : [];
  const options =
    audience.kind === 'roles'
      ? roles.map((role) => ({ id: role.roleId, label: roleLabel(t, role) }))
      : audience.kind === 'members'
        ? members
            .filter((member) => member.status === 'active')
            .map((member) => ({ id: member.humanId, label: member.displayName }))
        : [];
  return (
    <FormDialog
      title={
        current === undefined
          ? t('team.spaces.newTitle')
          : t('team.spaces.editTitle', { name: current.name })
      }
      description={t('team.spaces.dialogBody')}
      size="medium"
      scroll
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('team.save')}
      submitDisabled={name.trim().length === 0 || !audienceReady(audience)}
      busy={busy}
      error={errorNote}
      secondary={
        current === undefined ? undefined : (
          <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(true)}>
            {t('common.delete')}
          </Button>
        )
      }
      onCancel={onCancel}
      onSubmit={() =>
        run(() =>
          current === undefined
            ? createSpace(call, { name: name.trim(), audience })
            : updateSpace(call, { spaceId: current.spaceId, name: name.trim(), audience }),
        )
      }
    >
      <FieldStack>
        <TextField
          label={t('team.spaces.name')}
          value={name}
          onChange={setName}
          maxLength={60}
          initialFocus
        />
        <Field label={t('team.spaces.audience')} group>
          {() => (
            <>
              <Select
                label={t('team.spaces.audience')}
                value={audience.kind}
                disabled={busy}
                options={[
                  { value: 'everyone', label: t('team.spaces.audienceEveryone') },
                  { value: 'roles', label: t('team.spaces.audienceRoles') },
                  { value: 'members', label: t('team.spaces.audienceMembers') },
                ]}
                onChange={(kind) =>
                  setAudience(
                    kind === 'roles'
                      ? { kind: 'roles', roleIds: [] }
                      : kind === 'members'
                        ? { kind: 'members', humanIds: [] }
                        : { kind: 'everyone' },
                  )
                }
              />
              {options.length === 0 ? null : (
                <div {...stylex.props(styles.checks)}>
                  {options.map((option) => (
                    <div key={option.id} data-space-audience={option.id}>
                      <Checkbox
                        label={option.label}
                        checked={chosen.includes(option.id)}
                        disabled={busy}
                        onChange={(checked) => toggle(option.id, checked)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Field>
      </FieldStack>
    </FormDialog>
  );
}
