import { useId, useState, type ReactElement } from 'react';
import { Button, Checkbox, Input, SegmentedTabs, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import * as stylex from '@stylexjs/stylex';
import { Combobox } from './combobox.js';
import { MessagingHelp } from './messaging-help.js';
import { Field, TextAreaField, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { space } from './ds/tokens.stylex.js';
import { PairingTable } from './pairing-table.js';
import { BehaviorPermissionsPanel } from './behavior-permission-settings.js';
import type { BehaviorPermission } from '../../../core/src/messaging/behavior-policy.js';
import {
  GroupDetails,
  GroupDialog,
  PersonPermissions,
  type GroupBinding,
} from './permission-group-settings.js';
import type { ExternalPermissionGroup } from '../../../core/src/messaging/permission-groups.js';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  ExternalUserRole,
  SenderAccessInput,
  SenderPolicy,
} from '../../../core/src/messaging/sender-access.js';
import type {
  PairingCapability,
  PairingRequest,
  PairingReviewInput,
} from '../../../core/src/messaging/pairing.js';
import type { BotHarnessTranslate } from './locale.js';

const capabilities = ['approve', 'reject', 'answer', 'save-rules', 'review-pairing'] as const;
const labels = {
  approve: 'pairing.approveCapability',
  reject: 'pairing.rejectCapability',
  answer: 'pairing.answerCapability',
  'save-rules': 'pairing.rulesCapability',
  'review-pairing': 'pairing.reviewCapability',
} as const;

function auditColumn<Row extends { createdAt?: string; updatedAt?: string }>(
  t: BotHarnessTranslate,
): ColumnDef<Row> {
  return {
    id: 'time',
    accessorFn: (row) => Date.parse(row.updatedAt ?? '') || 0,
    header: t('pairing.time'),
    enableGlobalFilter: false,
    cell: ({ row }) => (
      <div className="bh-pairing-times">
        {(['createdAt', 'updatedAt'] as const).map((key) => {
          const value = row.original[key];
          const date = value ? new Date(value) : undefined;
          const valid = date && Number.isFinite(date.getTime());
          const label = t(key === 'createdAt' ? 'pairing.created' : 'pairing.modified');
          return (
            <span
              key={key}
              title={`${label}: ${valid ? date.toLocaleString() : t('pairing.timeUnknown')}`}
            >
              <span className="bh-muted">{label}</span>{' '}
              {valid ? (
                <time dateTime={value}>
                  {date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })}{' '}
                  {date.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </time>
              ) : (
                '—'
              )}
            </span>
          );
        })}
      </div>
    ),
  };
}
export function PairingSettings({
  requests,
  receivers = [],
  roles = [],
  groups = [],
  behaviorPermissions = [],
  bindings = [],
  policy,
  senderAccess,
  busy,
  failed = false,
  refresh,
  review,
  t,
}: {
  requests: PairingRequest[];
  roles?: ExternalUserRole[];
  groups?: ExternalPermissionGroup[];
  behaviorPermissions?: BehaviorPermission[];
  bindings?: GroupBinding[];
  policy?: SenderPolicy;
  senderAccess?(input: SenderAccessInput): Promise<void>;
  receivers?: { name: string; status: 'off' | 'connecting' | 'receiving' | 'unavailable' }[];
  busy: boolean;
  failed?: boolean;
  refresh(): Promise<void>;
  review(input: PairingReviewInput): Promise<void>;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const [tab, setTab] = useState<
    'people' | 'roles' | 'groups' | 'requests' | 'behaviorPermissions'
  >(requests.some((request) => request.status === 'pending') ? 'requests' : 'people');
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const people = requests.filter(
    (request) =>
      request.status === 'approved' ||
      (request.status === 'unavailable' && (!!request.roleId || request.capabilities.length > 0)),
  );
  const entries =
    tab === 'people' ? people : requests.filter((request) => !people.includes(request));
  const selected = entries.find((request) => request.id === selectedId) ?? entries[0];
  const selectedRole = roles.find((role) => role.id === selectedId) ?? roles[0];
  const selectedGroup = groups.find((group) => group.id === selectedId) ?? groups[0];
  const groupColumns: ColumnDef<ExternalPermissionGroup>[] = [
    { id: 'name', accessorKey: 'name', header: t('pairing.groupName') },
    {
      id: 'app',
      accessorFn: (group) =>
        bindings.find((binding) => binding.id === group.bindingId)?.name ?? group.bindingId,
      header: t('pairing.account'),
    },
    {
      id: 'people',
      accessorFn: (group) =>
        people.filter(
          (person) => person.status === 'approved' && group.memberIds.includes(person.id),
        ).length,
      header: t('pairing.people'),
    },
    auditColumn<ExternalPermissionGroup>(t),
  ];
  const requestColumns: ColumnDef<PairingRequest>[] = [
    {
      id: 'name',
      accessorFn: (request) => request.actorName ?? request.actorId,
      header: t('pairing.actor'),
    },
    { id: 'app', accessorKey: 'accountName', header: t('pairing.account') },
    {
      id: 'role',
      accessorFn: (request) =>
        request.purpose === 'conversation'
          ? (roles.find((role) => role.id === request.roleId)?.name ??
            t('pairing.conversationAccess'))
          : t('pairing.management'),
      header: t('pairing.role'),
    },
    {
      id: 'status',
      accessorFn: (request) => t(`pairing.${request.status}`),
      header: t('pairing.status'),
      cell: (cell) => <Tag>{String(cell.getValue())}</Tag>,
    },
    auditColumn<PairingRequest>(t),
  ];
  const roleColumns: ColumnDef<ExternalUserRole>[] = [
    { id: 'name', accessorKey: 'name', header: t('pairing.roleName') },
    {
      id: 'behavior',
      accessorKey: 'behavior',
      header: t('pairing.behavior'),
      cell: (cell) => <span className="bh-pairing-policy-preview">{String(cell.getValue())}</span>,
    },
    {
      id: 'people',
      accessorFn: (role) => people.filter((person) => person.roleId === role.id).length,
      header: t('pairing.people'),
    },
    auditColumn<ExternalUserRole>(t),
  ];
  return (
    <section className="bh-im-pairing" aria-label={t('pairing.title')}>
      <div className="bh-im-actions">
        {senderAccess && policy ? (
          <>
            <Checkbox
              label={t('pairing.restricted')}
              checked={policy.restricted}
              disabled={busy}
              onChange={(restricted) =>
                void senderAccess({
                  kind: 'policy',
                  restricted,
                  expectedRevision: policy.revision,
                }).catch(() => undefined)
              }
            />
            <MessagingHelp title={t('pairing.restricted')} text={t('pairing.policyLimit')} t={t} />
          </>
        ) : null}
        <span className="bh-pairing-toolbar-gap" />
        <Button size="sm" variant="toolbar" disabled={busy} onClick={() => void refresh()}>
          {t('pairing.refresh')}
        </Button>
        <MessagingHelp title={t('pairing.title')} text={t('pairing.hint')} t={t} />
      </div>
      {failed ? (
        <p className="bh-error" role="alert">
          {t('pairing.error')}
        </p>
      ) : null}
      {receivers.map((receiver) => (
        <p className="bh-muted bh-pairing-receiver" key={receiver.name} role="status">
          {receiver.name} · {t(`pairing.receiver.${receiver.status}`)}
        </p>
      ))}
      <SegmentedTabs
        label={t('pairing.title')}
        value={tab}
        onChange={(value) => {
          setTab(value);
          setSelectedId(undefined);
          setCreating(false);
        }}
        items={[
          {
            value: 'people',
            label: `${t('pairing.people')} (${people.length})`,
            id: `${id}-people`,
            panelId: `${id}-panel-people`,
          },
          {
            value: 'roles',
            label: `${t('pairing.roles')} (${roles.length})`,
            id: `${id}-roles`,
            panelId: `${id}-panel-roles`,
          },
          {
            value: 'groups',
            label: `${t('pairing.groups')} (${groups.length})`,
            id: `${id}-groups`,
            panelId: `${id}-panel-groups`,
          },
          {
            value: 'requests',
            label: `${t('pairing.requests')} (${requests.filter((request) => request.status === 'pending').length})`,
            id: `${id}-requests`,
            panelId: `${id}-panel-requests`,
          },
          {
            value: 'behaviorPermissions',
            label: `${t('pairing.behaviorPermissions')} (${behaviorPermissions.length})`,
            id: `${id}-behaviorPermissions`,
            panelId: `${id}-panel-behaviorPermissions`,
          },
        ]}
      />
      <div
        role="tabpanel"
        id={`${id}-panel-${tab}`}
        aria-labelledby={`${id}-${tab}`}
        className="bh-pairing-panel"
      >
        <div className="bh-im-actions">
          <strong>{t(`pairing.${tab}`)}</strong>
          <MessagingHelp
            title={t(`pairing.${tab}`)}
            text={t(
              tab === 'people'
                ? 'pairing.scope'
                : tab === 'roles'
                  ? 'pairing.policyLimit'
                  : tab === 'groups'
                    ? 'pairing.groupHelp'
                    : tab === 'behaviorPermissions'
                      ? 'pairing.behaviorHelp'
                      : 'pairing.hint',
            )}
            t={t}
          />
          <span className="bh-pairing-toolbar-gap" />
          {senderAccess && tab !== 'behaviorPermissions' ? (
            <Button size="sm" variant="toolbar" disabled={busy} onClick={() => setCreating(true)}>
              {t(tab === 'groups' ? 'pairing.createGroup' : 'pairing.createRole')}
            </Button>
          ) : null}
        </div>
        {tab === 'behaviorPermissions' ? (
          <BehaviorPermissionsPanel
            items={behaviorPermissions}
            groups={groups}
            people={people}
            busy={busy}
            change={senderAccess}
            t={t}
          />
        ) : (
          <div className="bh-pairing-workspace">
            {tab === 'groups' ? (
              <PairingTable
                key="groups"
                data={groups}
                columns={groupColumns}
                selectedId={selectedGroup?.id}
                select={(group) => setSelectedId(group.id)}
                label={t('pairing.groups')}
                empty={t('pairing.noGroups')}
                t={t}
              />
            ) : tab === 'roles' ? (
              <PairingTable
                key="roles"
                data={roles}
                columns={roleColumns}
                selectedId={selectedRole?.id}
                select={(role) => setSelectedId(role.id)}
                label={t('pairing.roles')}
                empty={t('pairing.noRoles')}
                t={t}
              />
            ) : (
              <PairingTable
                key={tab}
                data={entries}
                columns={requestColumns}
                selectedId={selected?.id}
                select={(request) => setSelectedId(request.id)}
                label={t(`pairing.${tab}`)}
                empty={t(tab === 'people' ? 'pairing.noPeople' : 'pairing.noRequests')}
                t={t}
              />
            )}
            <aside className="bh-pairing-detail" aria-label={t('pairing.details')}>
              {tab === 'groups' ? (
                selectedGroup ? (
                  <GroupDetails
                    key={`${selectedGroup.id}:${selectedGroup.revision}`}
                    group={selectedGroup}
                    behaviorPermissions={behaviorPermissions}
                    groups={groups}
                    people={people}
                    bindings={bindings}
                    busy={busy}
                    change={senderAccess}
                    t={t}
                  />
                ) : (
                  <p className="bh-muted">{t('pairing.noGroups')}</p>
                )
              ) : tab === 'roles' ? (
                selectedRole ? (
                  <RoleDetails
                    key={`${selectedRole.id}:${selectedRole.revision}`}
                    role={selectedRole}
                    busy={busy}
                    change={senderAccess}
                    t={t}
                  />
                ) : (
                  <p className="bh-muted">{t('pairing.noRoles')}</p>
                )
              ) : selected ? (
                <PairingRow
                  key={`${selected.id}:${selected.revision}:${policy?.revision}`}
                  request={selected}
                  selectGroup={(id) => {
                    setSelectedId(id);
                    setTab('groups');
                  }}
                  roles={roles}
                  busy={busy}
                  review={review}
                  {...(senderAccess ? { senderAccess } : {})}
                  t={t}
                />
              ) : (
                <p className="bh-muted">{t('pairing.selectPerson')}</p>
              )}
            </aside>
          </div>
        )}
      </div>
      {creating && senderAccess && tab === 'groups' ? (
        <GroupDialog
          behaviorPermissions={behaviorPermissions}
          groups={groups}
          people={people}
          bindings={bindings}
          busy={busy}
          change={senderAccess}
          close={() => setCreating(false)}
          t={t}
        />
      ) : creating && senderAccess ? (
        <RoleDialog
          key={roles.map((role) => `${role.id}:${role.revision}`).join(',')}
          busy={busy}
          change={senderAccess}
          close={() => setCreating(false)}
          t={t}
        />
      ) : null}
    </section>
  );
}
function PairingRow({
  request,
  selectGroup,
  roles,
  busy,
  review,
  senderAccess,
  t,
}: {
  request: PairingRequest;
  selectGroup(id: string): void;
  roles: ExternalUserRole[];
  busy: boolean;
  review(input: PairingReviewInput): Promise<void>;
  senderAccess?(input: SenderAccessInput): Promise<void>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [selected, setSelected] = useState<PairingCapability[]>([]);
  const [roleId, setRoleId] = useState(request.roleId ?? '');
  const selectedRole = roles.find((role) => role.id === roleId);
  const assignedRole = roles.find((role) => role.id === request.roleId);
  const input = { id: request.id, expectedRevision: request.revision };
  return (
    <article className="bh-im-pairing-request">
      <div className="bh-im-actions">
        <strong>{request.actorName ?? t('pairing.unknownName')}</strong>
        <Tag>{t(`pairing.${request.status}`)}</Tag>
        <MessagingHelp title={t('pairing.actor')} text={t('pairing.scope')} t={t} />
      </div>
      <dl>
        <div>
          <dt>{t('pairing.actor')}</dt>
          <dd>
            <details>
              <summary>
                <code>
                  {request.actorId.slice(0, 3)}…{request.actorId.slice(-6)}
                </code>
              </summary>
              <code>{request.actorId}</code>
            </details>
          </dd>
        </div>
        <div>
          <dt>{t('pairing.account')}</dt>
          <dd>{request.accountName}</dd>
        </div>
        <div>
          <dt>{t('pairing.reference')}</dt>
          <dd>{request.reference}</dd>
        </div>
        {request.status === 'pending' ? (
          <div>
            <dt>{t('pairing.expires')}</dt>
            <dd>
              <time dateTime={request.expiresAt}>
                {new Date(request.expiresAt).toLocaleString()}
              </time>
            </dd>
          </div>
        ) : null}
      </dl>
      {request.purpose === 'conversation' ? (
        <p>{assignedRole?.name ?? t('pairing.conversationAccess')}</p>
      ) : (
        <div className="bh-im-actions">
          <span>{t('pairing.management')}</span>
          <MessagingHelp
            title={t('pairing.management')}
            text={t('pairing.managementAccess')}
            t={t}
          />
        </div>
      )}
      {request.notifications?.some(
        (item) => item.key.startsWith('approved:') && item.outcome !== 'accepted',
      ) ? (
        <p role="status">{t('pairing.noticeUnconfirmed')}</p>
      ) : null}
      {request.status === 'pending' ? (
        <>
          {request.purpose === 'conversation' ? (
            <Combobox
              label={t('pairing.role')}
              toggleLabel={t('pairing.role')}
              value={roleId}
              fallbackValue=""
              disabled={busy}
              searchable={false}
              onSelect={setRoleId}
              options={[
                { value: '', label: t('pairing.selectRole') },
                ...roles.map((role) => ({
                  value: role.id,
                  label: role.name,
                  hint: role.capabilities.length
                    ? role.capabilities.map((capability) => t(labels[capability])).join(' · ')
                    : t('pairing.ordinary'),
                })),
              ]}
            />
          ) : (
            <fieldset disabled={busy} className="bh-im-pairing-capabilities">
              <legend>{t('pairing.approve')}</legend>
              {capabilities.map((capability) => (
                <Checkbox
                  key={capability}
                  label={t(labels[capability])}
                  checked={selected.includes(capability)}
                  disabled={busy}
                  onChange={(checked) =>
                    setSelected((value) =>
                      checked
                        ? [...value, capability]
                        : value.filter((item) => item !== capability),
                    )
                  }
                />
              ))}
            </fieldset>
          )}
          <div className="bh-im-actions">
            <Button
              size="sm"
              variant="primary"
              disabled={
                busy || (request.purpose === 'conversation' ? !selectedRole : selected.length === 0)
              }
              onClick={() =>
                void review(
                  request.purpose === 'conversation' && selectedRole
                    ? {
                        ...input,
                        kind: 'approve',
                        roleId: selectedRole.id,
                        expectedRoleRevision: selectedRole.revision,
                      }
                    : { ...input, kind: 'approve', capabilities: selected },
                )
              }
            >
              {t(request.purpose === 'conversation' ? 'pairing.approveRole' : 'pairing.approve')}
            </Button>
            <Button
              size="sm"
              variant="toolbar"
              disabled={busy}
              onClick={() => void review({ ...input, kind: 'reject' })}
            >
              {t('pairing.reject')}
            </Button>
          </div>
        </>
      ) : request.status === 'approved' ||
        (request.status === 'unavailable' &&
          (request.capabilities.length > 0 || !!request.roleId)) ? (
        <>
          <div className="bh-im-pairing-capabilities">
            {request.capabilities.map((capability) => (
              <Tag key={capability}>{t(labels[capability])}</Tag>
            ))}
          </div>
          <Button
            size="sm"
            variant="toolbar"
            disabled={busy}
            onClick={() => void review({ ...input, kind: 'revoke' })}
          >
            {t('pairing.revoke')}
          </Button>
          {request.status === 'approved' && request.purpose === 'conversation' && senderAccess ? (
            <>
              <PersonPermissions
                request={request}
                selectGroup={selectGroup}
                busy={busy}
                change={senderAccess}
                t={t}
              />
              <Combobox
                label={t('pairing.role')}
                toggleLabel={t('pairing.role')}
                value={roleId}
                fallbackValue=""
                disabled={busy}
                searchable={false}
                onSelect={setRoleId}
                options={[
                  { value: '', label: t('pairing.selectRole') },
                  ...roles.map((role) => ({ value: role.id, label: role.name })),
                ]}
              />
              <Button
                size="sm"
                disabled={busy || !selectedRole || selectedRole.id === request.roleId}
                onClick={() =>
                  selectedRole &&
                  void senderAccess({
                    ...input,
                    kind: 'reassign-role',
                    roleId: selectedRole.id,
                    expectedRoleRevision: selectedRole.revision,
                  }).catch(() => undefined)
                }
              >
                {t('pairing.reassignRole')}
              </Button>
            </>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

function RoleDetails({
  role,
  busy,
  change,
  t,
}: {
  role: ExternalUserRole;
  busy: boolean;
  change?: ((input: SenderAccessInput) => Promise<void>) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  return (
    <article className="bh-im-pairing-request">
      <strong>{role.name}</strong>
      <div className="bh-im-actions">
        <span>{t('pairing.behavior')}</span>
        <MessagingHelp title={t('pairing.behavior')} text={t('pairing.policyLimit')} t={t} />
      </div>
      <p className="bh-pairing-behavior">{role.behavior}</p>
      <div className="bh-im-pairing-capabilities">
        {role.capabilities.length ? (
          role.capabilities.map((capability) => <Tag key={capability}>{t(labels[capability])}</Tag>)
        ) : (
          <Tag>{t('pairing.ordinary')}</Tag>
        )}
      </div>
      {role.delegableCapabilities?.length ? (
        <div className="bh-im-pairing-capabilities">
          <span>{t('pairing.delegable')}</span>
          {role.delegableCapabilities.map((capability) => (
            <Tag key={capability}>{t(labels[capability])}</Tag>
          ))}
        </div>
      ) : null}
      {change ? (
        <Button size="sm" variant="toolbar" disabled={busy} onClick={() => setEditing(true)}>
          {t('pairing.editRole')}
        </Button>
      ) : null}
      {editing && change ? (
        <RoleDialog
          key={`${role.id}:${role.revision}`}
          role={role}
          busy={busy}
          change={change}
          close={() => setEditing(false)}
          t={t}
        />
      ) : null}
    </article>
  );
}

const roleStyles = stylex.create({
  inline: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x2,
  },
  choices: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x4,
  },
});

function RoleDialog({
  role,
  busy,
  change,
  close,
  t,
}: {
  role?: ExternalUserRole;
  busy: boolean;
  change(input: SenderAccessInput): Promise<void>;
  close(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [name, setName] = useState(role?.name ?? '');
  const [behavior, setBehavior] = useState(role?.behavior ?? '');
  const [selected, setSelected] = useState<
    ('approve' | 'reject' | 'review-pairing' | 'save-rules')[]
  >(
    (role?.capabilities ?? []).filter(
      (capability): capability is 'approve' | 'reject' | 'review-pairing' | 'save-rules' =>
        capability === 'approve' ||
        capability === 'reject' ||
        capability === 'review-pairing' ||
        capability === 'save-rules',
    ),
  );
  const [delegable, setDelegable] = useState<
    ('approve' | 'reject' | 'review-pairing' | 'save-rules')[]
  >(
    (role?.delegableCapabilities ?? []).filter(
      (cap): cap is 'approve' | 'reject' | 'review-pairing' | 'save-rules' =>
        cap === 'approve' || cap === 'reject' || cap === 'review-pairing' || cap === 'save-rules',
    ),
  );
  const [failed, setFailed] = useState(false);
  const submit = async () => {
    setFailed(false);
    try {
      await change(
        role
          ? {
              kind: 'edit-role',
              id: role.id,
              expectedRevision: role.revision,
              name,
              behavior,
              capabilities: selected,
              delegableCapabilities: delegable,
            }
          : { kind: 'create-role', name, behavior },
      );
      close();
    } catch {
      setFailed(true);
    }
  };
  return (
    <FormDialog
      size="medium"
      title={t(role ? 'pairing.editRole' : 'pairing.createRole')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t(role ? 'pairing.saveRole' : 'pairing.createRole')}
      onCancel={close}
      onClose={() => {
        if (!busy) close();
      }}
      onSubmit={() => void submit()}
      submitDisabled={!name.trim() || !behavior.trim()}
      busy={busy}
      error={failed ? t('pairing.error') : undefined}
    >
      <TextField
        label={t('pairing.roleName')}
        initialFocus
        value={name}
        maxLength={80}
        disabled={busy}
        onChange={setName}
      />
      <TextAreaField
        label={
          <span {...stylex.props(roleStyles.inline)}>
            {t('pairing.behavior')}
            <MessagingHelp title={t('pairing.behavior')} text={t('pairing.policyLimit')} t={t} />
          </span>
        }
        value={behavior}
        maxLength={2000}
        disabled={busy}
        onChange={setBehavior}
      />
      {role ? (
        <Field
          group
          label={
            <span {...stylex.props(roleStyles.inline)}>
              {t('pairing.roleCapabilities')}
              <MessagingHelp
                title={t('pairing.roleCapabilities')}
                text={t('pairing.privateRoleApproval')}
                t={t}
              />
            </span>
          }
        >
          {() => (
            <div {...stylex.props(roleStyles.choices)}>
              {(['approve', 'reject', 'review-pairing', 'save-rules'] as const).map(
                (capability) => (
                  <Checkbox
                    key={capability}
                    label={t(labels[capability])}
                    checked={selected.includes(capability)}
                    disabled={busy}
                    onChange={(checked) =>
                      setSelected((value) =>
                        checked
                          ? [...value, capability]
                          : value.filter((item) => item !== capability),
                      )
                    }
                  />
                ),
              )}
            </div>
          )}
        </Field>
      ) : (
        <div {...stylex.props(roleStyles.inline)}>
          <Tag>{t('pairing.ordinary')}</Tag>
          <MessagingHelp
            title={t('pairing.createRole')}
            text={t('pairing.managementAccess')}
            t={t}
          />
        </div>
      )}
      {role ? (
        <Field
          group
          label={
            <span {...stylex.props(roleStyles.inline)}>
              {t('pairing.delegable')}
              <MessagingHelp
                title={t('pairing.delegable')}
                text={t('pairing.delegationHelp')}
                t={t}
              />
            </span>
          }
        >
          {() => (
            <div {...stylex.props(roleStyles.choices)}>
              {(['approve', 'reject', 'review-pairing', 'save-rules'] as const).map(
                (capability) => (
                  <Checkbox
                    key={capability}
                    label={`${t('pairing.delegateAllow')} · ${t(labels[capability])}`}
                    checked={delegable.includes(capability)}
                    disabled={busy}
                    onChange={(checked) =>
                      setDelegable((value) =>
                        checked
                          ? [...value, capability]
                          : value.filter((item) => item !== capability),
                      )
                    }
                  />
                ),
              )}
            </div>
          )}
        </Field>
      ) : null}
    </FormDialog>
  );
}
