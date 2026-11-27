import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { roleChoiceLabel } from './channel-access.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { Menu } from './ds/menu.js';
import { Select } from './ds/select.js';
import { SettingsGroupPart, SettingsSection } from './ds/settings-row.js';
import { Tag, type TagTone } from './ds/tag.js';
import { ink, space, style, type } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  APPROVAL_KEYS,
  POLICY_KEYS,
  isApprovalKey,
  type ChannelPolicy,
  type PolicyKey,
  type PolicyValue,
  type RoleChoice,
} from './team-channels-bridge.js';

const inset = style.listItemPadding;

const styles = stylex.create({
  scroll: { overflowX: 'auto', minWidth: 0 },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: type.bodySize,
    lineHeight: type.bodyLine,
  },
  head: {
    paddingBlock: space.x3,
    paddingInline: space.x3,
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
    fontWeight: type.labelWeight,
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  actionHead: { textAlign: 'start', paddingInlineStart: inset },
  action: {
    paddingBlock: style.listItemPaddingBlock,
    paddingInlineStart: inset,
    paddingInlineEnd: space.x3,
    color: ink.primary,
    fontWeight: type.bodyWeight,
    textAlign: 'start',
    whiteSpace: 'nowrap',
  },
  cell: {
    paddingBlock: style.listItemPaddingBlock,
    paddingInline: space.x3,
    textAlign: 'center',
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x4,
    margin: 0,
    paddingBlock: space.x3,
    paddingInline: inset,
    listStyle: 'none',
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
  },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: space.x2 },
});

const TONE: Record<PolicyValue, TagTone> = { allow: 'success', deny: 'danger', inherit: 'neutral' };
const GLYPH: Record<PolicyValue, string> = { allow: 'check', deny: 'x', inherit: 'minus' };

function stateLabel(t: BotHarnessTranslate, value: PolicyValue, everyone: boolean): string {
  if (value === 'allow') return t('team.workbench.allow');
  if (value === 'deny') return t('team.workbench.deny');
  return everyone ? t('team.workbench.channels.inherit') : t('team.workbench.channels.follow');
}

function StateMark({ value }: { value: PolicyValue }): ReactElement {
  return (
    <Tag tone={TONE[value]}>
      <Icon name={GLYPH[value]} />
    </Tag>
  );
}

interface Column {
  readonly roleId: string | undefined;
  readonly name: string;
  readonly actions: Readonly<Partial<Record<PolicyKey, PolicyValue>>>;
}

export function ChannelPermissionTable({
  t,
  policy,
  roles,
  disabled,
  approvalLocked = false,
  onChange,
}: {
  t: BotHarnessTranslate;
  policy: ChannelPolicy;
  roles: readonly RoleChoice[];
  disabled: boolean;
  approvalLocked?: boolean;
  onChange(policy: ChannelPolicy): void;
}): ReactElement {
  const [menu, setMenu] = useState<string>();
  const available = roles.filter(
    ({ roleId }) => !policy.overrides.some((row) => row.roleId === roleId),
  );
  const columns: Column[] = [
    { roleId: undefined, name: t('team.workbench.channels.everyone'), actions: policy.everyone },
    ...policy.overrides.map((row) => {
      const role = roles.find((item) => item.roleId === row.roleId);
      return {
        roleId: row.roleId,
        name: role === undefined ? row.roleId : roleChoiceLabel(t, role),
        actions: row.actions,
      };
    }),
  ];
  const canAdd = !disabled && available.length > 0 && policy.overrides.length < 100;
  const set = (column: Column, key: PolicyKey, value: PolicyValue): void =>
    onChange(
      column.roleId === undefined
        ? { ...policy, everyone: { ...policy.everyone, [key]: value } }
        : {
            ...policy,
            overrides: policy.overrides.map((row) =>
              row.roleId === column.roleId
                ? { ...row, actions: { ...row.actions, [key]: value } }
                : row,
            ),
          },
    );
  return (
    <SettingsSection
      title={t('team.workbench.channels.policyTitle')}
      action={<Tag tone="info">{t('team.workbench.enforced')}</Tag>}
      data={{ 'data-channel-permission-table': '' }}
    >
      <SettingsGroupPart>
        <div {...stylex.props(styles.scroll)}>
          <table
            {...stylex.props(styles.table)}
            aria-label={t('team.workbench.channels.permissions')}
          >
            <thead>
              <tr>
                <th scope="col" {...stylex.props(styles.head, styles.actionHead)}>
                  {t('team.workbench.channels.action')}
                </th>
                {columns.map((column) => (
                  <th
                    key={column.roleId ?? ''}
                    scope="col"
                    {...stylex.props(styles.head)}
                    data-permission-column={column.roleId ?? 'everyone'}
                  >
                    {column.roleId === undefined ||
                    disabled ||
                    (approvalLocked &&
                      APPROVAL_KEYS.some(
                        (key) => column.actions[key] === 'allow' || column.actions[key] === 'deny',
                      )) ? (
                      column.name
                    ) : (
                      <Menu
                        open={menu === column.roleId}
                        portal
                        dense
                        autoFocus
                        align="start"
                        anchor={
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-haspopup="menu"
                            aria-expanded={menu === column.roleId}
                            aria-label={t('team.workbench.channels.roleMenu', {
                              role: column.name,
                            })}
                            onClick={() =>
                              setMenu((current) =>
                                current === column.roleId ? undefined : column.roleId,
                              )
                            }
                          >
                            {column.name}
                          </Button>
                        }
                        items={[
                          {
                            id: 'remove',
                            label: t('team.workbench.channels.removeRole'),
                            icon: <Icon name="trash" />,
                            danger: true,
                          },
                        ]}
                        onSelect={() => {
                          setMenu(undefined);
                          onChange({
                            ...policy,
                            overrides: policy.overrides.filter(
                              (row) => row.roleId !== column.roleId,
                            ),
                          });
                        }}
                        onClose={() => setMenu(undefined)}
                      />
                    )}
                  </th>
                ))}
                {canAdd ? (
                  <th scope="col" {...stylex.props(styles.head)}>
                    <Menu
                      open={menu === ''}
                      portal
                      dense
                      autoFocus
                      align="end"
                      anchor={
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Icon name="plus" />}
                          aria-haspopup="menu"
                          aria-expanded={menu === ''}
                          aria-label={t('team.workbench.channels.addRoleLabel')}
                          data-permission-add-role=""
                          onClick={() => setMenu((current) => (current === '' ? undefined : ''))}
                        >
                          {t('team.workbench.channels.addRole')}
                        </Button>
                      }
                      items={available.map((role) => ({
                        id: role.roleId,
                        label: roleChoiceLabel(t, role),
                      }))}
                      onSelect={(roleId) => {
                        setMenu(undefined);
                        onChange({
                          ...policy,
                          overrides: [...policy.overrides, { roleId, actions: {} }],
                        });
                      }}
                      onClose={() => setMenu(undefined)}
                    />
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {POLICY_KEYS.map((key) => {
                const action = t(`channelAccess.policy.${key}`);
                return (
                  <tr key={key} data-permission-action={key}>
                    <th scope="row" {...stylex.props(styles.action)}>
                      {action}
                    </th>
                    {columns.map((column) => {
                      const everyone = column.roleId === undefined;
                      const value = column.actions[key] ?? 'inherit';
                      return (
                        <td
                          key={column.roleId ?? ''}
                          {...stylex.props(styles.cell)}
                          data-permission-cell={`${key}:${column.roleId ?? 'everyone'}`}
                          data-state={value}
                        >
                          <Select<PolicyValue>
                            appearance="cell"
                            align="start"
                            label={t('team.workbench.channels.cell', {
                              action,
                              role: column.name,
                              state: stateLabel(t, value, everyone),
                            })}
                            options={(['allow', 'deny', 'inherit'] as const).map((option) => ({
                              value: option,
                              label: stateLabel(t, option, everyone),
                              icon: <Icon name={GLYPH[option]} />,
                              display: <StateMark value={option} />,
                            }))}
                            value={value}
                            disabled={disabled || (approvalLocked && isApprovalKey(key))}
                            onChange={(next) => set(column, key, next)}
                          />
                        </td>
                      );
                    })}
                    {canAdd ? <td {...stylex.props(styles.cell)} /> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul {...stylex.props(styles.legend)} aria-label={t('team.workbench.channels.legend')}>
          {(['allow', 'deny', 'inherit'] as const).map((value) => (
            <li key={value} {...stylex.props(styles.legendItem)}>
              <StateMark value={value} />
              {stateLabel(t, value, false)}
            </li>
          ))}
        </ul>
      </SettingsGroupPart>
    </SettingsSection>
  );
}
