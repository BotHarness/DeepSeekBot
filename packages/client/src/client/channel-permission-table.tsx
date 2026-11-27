import * as stylex from '@stylexjs/stylex';
import { Button } from './ds/button.js';
import { Select } from './ds/select.js';
import { layer, space } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  POLICY_KEYS,
  type ChannelPolicy,
  type PolicyValue,
  type RoleChoice,
} from './team-channels-bridge.js';
import { roleChoiceLabel } from './channel-access.js';

const styles = stylex.create({
  root: { overflowX: 'auto', padding: space.x4, backgroundColor: layer.raised },
  cell: { padding: space.x2, textAlign: 'start' },
});

export function ChannelPermissionTable({
  t,
  policy,
  roles,
  disabled,
  onChange,
}: {
  t: BotHarnessTranslate;
  policy: ChannelPolicy;
  roles: readonly RoleChoice[];
  disabled: boolean;
  onChange(policy: ChannelPolicy): void;
}) {
  const options: { value: PolicyValue; label: string }[] = [
    { value: 'allow', label: t('team.workbench.allow') },
    { value: 'deny', label: t('team.workbench.deny') },
    { value: 'inherit', label: t('team.workbench.channels.inherit') },
  ];
  const available = roles.filter(
    ({ roleId }) => !policy.overrides.some((row) => row.roleId === roleId),
  );
  const rows = [{ roleId: undefined, actions: policy.everyone }, ...policy.overrides];
  return (
    <section {...stylex.props(styles.root)} data-channel-permission-table="">
      <table aria-label={t('team.workbench.channels.permissions')}>
        <thead>
          <tr>
            <th scope="col" {...stylex.props(styles.cell)}>
              {t('team.workbench.internalRoles')}
            </th>
            {POLICY_KEYS.map((key) => (
              <th key={key} scope="col" {...stylex.props(styles.cell)}>
                {t(`channelAccess.policy.${key}`)}
              </th>
            ))}
            {disabled ? null : <td />}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ roleId, actions }) => {
            const role = roles.find((item) => item.roleId === roleId);
            const name =
              roleId === undefined
                ? t('team.workbench.channels.everyone')
                : role === undefined
                  ? roleId
                  : roleChoiceLabel(t, role);
            return (
              <tr key={roleId ?? ''}>
                <th scope="row" {...stylex.props(styles.cell)}>
                  {name}
                </th>
                {POLICY_KEYS.map((key) => (
                  <td key={key} {...stylex.props(styles.cell)}>
                    <Select<PolicyValue>
                      label={`${name} · ${t(`channelAccess.policy.${key}`)}`}
                      options={options}
                      value={actions[key] ?? 'inherit'}
                      disabled={disabled}
                      onChange={(value) =>
                        onChange(
                          roleId === undefined
                            ? { ...policy, everyone: { ...policy.everyone, [key]: value } }
                            : {
                                ...policy,
                                overrides: policy.overrides.map((row) =>
                                  row.roleId === roleId
                                    ? { ...row, actions: { ...row.actions, [key]: value } }
                                    : row,
                                ),
                              },
                        )
                      }
                    />
                  </td>
                ))}
                {disabled ? null : (
                  <td {...stylex.props(styles.cell)}>
                    {roleId === undefined ? null : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onChange({
                            ...policy,
                            overrides: policy.overrides.filter((row) => row.roleId !== roleId),
                          })
                        }
                      >
                        {t('team.workbench.channels.removeRole')}
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {disabled || available.length === 0 || policy.overrides.length >= 100 ? null : (
        <Select
          label={t('channelAccess.chooseRoles')}
          value=""
          options={[
            { value: '', label: t('channelAccess.chooseRoles') },
            ...available.map((role) => ({ value: role.roleId, label: roleChoiceLabel(t, role) })),
          ]}
          onChange={(roleId) => {
            if (roleId)
              onChange({ ...policy, overrides: [...policy.overrides, { roleId, actions: {} }] });
          }}
        />
      )}
    </section>
  );
}
