import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeCall } from './bridge.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow } from './ds/settings-row.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { ChannelHumanMember } from './store.js';
import {
  loadChannelAccess,
  POLICY_KEYS,
  setChannelAdmins,
  setChannelPolicy,
  setChannelVisibility,
  type ChannelAccess,
  type ChannelVisibility,
  type PolicyKey,
  type PolicyValue,
} from './team-channels-bridge.js';
import { loadRoles, type TeamRole } from './team-roles-bridge.js';
import { teamErrorText } from './team-settings.js';
import { useTeamMode } from './team-state.js';
import { visibilitySummary } from './channel-access.js';

const styles = stylex.create({
  checks: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
});

type Dialog = 'roles' | 'admins';

export function ChannelAccessSettings({
  call,
  channelId,
  humans,
  t,
}: {
  readonly call: BridgeCall;
  readonly channelId: string;
  readonly humans: readonly ChannelHumanMember[];
  readonly t: BotHarnessTranslate;
}): ReactElement | null {
  const team = useTeamMode(call);
  const [access, setAccess] = useState<ChannelAccess>();
  const [roles, setRoles] = useState<readonly TeamRole[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<Dialog>();
  const request = useRef(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    const version = ++request.current;
    Promise.all([
      loadChannelAccess(call, channelId, controller.signal),
      loadRoles(call, controller.signal).catch(() => []),
    ])
      .then(([next, list]) => {
        if (controller.signal.aborted || version !== request.current) return;
        setAccess(next);
        setRoles(list);
      })
      .catch(() => {
        if (!controller.signal.aborted && version === request.current) setAccess(undefined);
      });
    return () => controller.abort();
  }, [call, channelId]);
  const run = (work: () => Promise<ChannelAccess>, after?: () => void): void => {
    const version = ++request.current;
    setBusy(true);
    setError(undefined);
    work()
      .then((next) => {
        if (version !== request.current) return;
        setAccess(next);
        after?.();
      })
      .catch((failure: unknown) => {
        if (version === request.current) setError(teamErrorText(t, failure));
      })
      .finally(() => setBusy(false));
  };
  const visible = team?.enabled === true && access !== undefined && access.role !== 'member';
  if (!visible) return <div ref={mount} hidden data-channel-access="hidden" />;
  const current = access;
  const chooseVisibility = (kind: ChannelVisibility['kind']): void => {
    if (kind === 'roles') {
      setDialog('roles');
      return;
    }
    run(async () => {
      await setChannelVisibility(call, channelId, { kind });
      return { ...current, visibility: { kind } };
    });
  };
  const choosePolicy = (key: PolicyKey, value: PolicyValue): void => {
    const policy = { ...current.policy, [key]: value };
    run(async () => {
      await setChannelPolicy(call, channelId, policy);
      return { ...current, policy };
    });
  };
  const errorNote = error === undefined ? undefined : <Note tone="danger">{error}</Note>;
  return (
    <div ref={mount} data-channel-access={current.role}>
      <SettingsRow
        title={t('channelAccess.visibility')}
        description={visibilitySummary(t, current.visibility, roles)}
        data={{ 'data-team-row': 'channel-visibility' }}
        control={
          <Select
            label={t('channelAccess.visibility')}
            value={current.visibility.kind}
            disabled={busy}
            options={[
              { value: 'public', label: t('channelAccess.public') },
              { value: 'roles', label: t('channelAccess.roles') },
              { value: 'private', label: t('channelAccess.private') },
            ]}
            onChange={chooseVisibility}
          />
        }
      >
        {current.visibility.kind === 'roles' ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setDialog('roles')}>
            {t('channelAccess.chooseRoles')}
          </Button>
        ) : null}
      </SettingsRow>
      {POLICY_KEYS.map((key) => (
        <SettingsRow
          key={key}
          title={t(`channelAccess.policy.${key}`)}
          data={{ 'data-channel-policy': key }}
          control={
            <Select
              label={t(`channelAccess.policy.${key}`)}
              value={current.policy[key]}
              disabled={busy}
              options={[
                { value: 'everyone', label: t('channelAccess.everyone') },
                { value: 'admins', label: t('channelAccess.adminsOnly') },
              ]}
              onChange={(value) => choosePolicy(key, value)}
            />
          }
        />
      ))}
      <SettingsRow
        title={t('channelAccess.admins')}
        description={
          current.admins.length === 0
            ? t('channelAccess.noAdmins')
            : current.admins.map((admin) => admin.displayName).join(', ')
        }
        data={{ 'data-team-row': 'channel-admins' }}
        control={
          current.role === 'owner' ? (
            <Button variant="outline" disabled={busy} onClick={() => setDialog('admins')}>
              {t('channelAccess.editAdmins')}
            </Button>
          ) : undefined
        }
      >
        {dialog === undefined ? errorNote : null}
      </SettingsRow>
      {dialog === 'roles' ? (
        <PickDialog
          t={t}
          title={t('channelAccess.rolesTitle')}
          description={t('channelAccess.rolesBody')}
          empty={t('channelAccess.rolesEmpty')}
          options={roles.map((role) => ({ id: role.roleId, label: role.name }))}
          initial={current.visibility.kind === 'roles' ? current.visibility.roleIds : []}
          requireOne
          busy={busy}
          error={errorNote}
          onCancel={() => {
            setDialog(undefined);
            setError(undefined);
          }}
          onSave={(roleIds) =>
            run(
              async () => {
                const visibility = { kind: 'roles', roleIds } as const;
                await setChannelVisibility(call, channelId, visibility);
                return { ...current, visibility };
              },
              () => setDialog(undefined),
            )
          }
        />
      ) : null}
      {dialog === 'admins' ? (
        <PickDialog
          t={t}
          title={t('channelAccess.adminsTitle')}
          description={t('channelAccess.adminsBody')}
          empty={t('channelAccess.adminsEmpty')}
          options={humans.map((human) => ({ id: human.humanId, label: human.displayName }))}
          initial={current.admins.map((admin) => admin.humanId)}
          busy={busy}
          error={errorNote}
          onCancel={() => {
            setDialog(undefined);
            setError(undefined);
          }}
          onSave={(humanIds) =>
            run(
              async () => {
                await setChannelAdmins(call, channelId, humanIds);
                return {
                  ...current,
                  admins: humans
                    .filter((human) => humanIds.includes(human.humanId))
                    .map((human) => ({ humanId: human.humanId, displayName: human.displayName })),
                };
              },
              () => setDialog(undefined),
            )
          }
        />
      ) : null}
    </div>
  );
}

function PickDialog({
  t,
  title,
  description,
  empty,
  options,
  initial,
  requireOne = false,
  busy,
  error,
  onCancel,
  onSave,
}: {
  t: BotHarnessTranslate;
  title: string;
  description: string;
  empty: string;
  options: readonly { id: string; label: string }[];
  initial: readonly string[];
  requireOne?: boolean;
  busy: boolean;
  error: ReactElement | undefined;
  onCancel(): void;
  onSave(ids: string[]): void;
}): ReactElement {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(initial));
  const toggle = (id: string, checked: boolean): void =>
    setChosen((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <FormDialog
      title={title}
      description={description}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('channelAccess.save')}
      submitDisabled={requireOne && chosen.size === 0}
      busy={busy}
      error={error}
      onCancel={onCancel}
      onSubmit={() => onSave(options.map((option) => option.id).filter((id) => chosen.has(id)))}
    >
      {options.length === 0 ? (
        <Note>{empty}</Note>
      ) : (
        <div {...stylex.props(styles.checks)}>
          {options.map((option) => (
            <div key={option.id} data-pick={option.id}>
              <Checkbox
                label={option.label}
                checked={chosen.has(option.id)}
                disabled={busy}
                onChange={(checked) => toggle(option.id, checked)}
              />
            </div>
          ))}
        </div>
      )}
    </FormDialog>
  );
}
