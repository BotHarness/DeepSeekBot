import { useId, useState, type ReactElement } from 'react';
import { Button, Checkbox, Input, SegmentedTabs, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  ExternalPermissionGroup,
  PermissionChoices,
} from '../../../core/src/messaging/permission-groups.js';
import type { PairingRequest } from '../../../core/src/messaging/pairing.js';
import type { PairingCapability } from '../../../core/src/messaging/pairing.js';
import type { SenderAccessInput } from '../../../core/src/messaging/sender-access.js';
import type { BotHarnessTranslate } from './locale.js';
import { Combobox } from './combobox.js';
import { MessagingHelp } from './messaging-help.js';
import { Modal } from './modal.js';
import { PairingTable } from './pairing-table.js';
import {
  BehaviorSelection,
  BehaviorResult,
  BehaviorPreview,
  BehaviorCompatibility,
  configuredBehaviorConflicts,
} from './behavior-permission-settings.js';
import type {
  BehaviorPermission,
  BehaviorChoices,
} from '../../../core/src/messaging/behavior-policy.js';

const capabilities = ['approve', 'reject', 'review-pairing'] as const;
const capabilityLabel = {
  approve: 'pairing.approveCapability',
  reject: 'pairing.rejectCapability',
  'review-pairing': 'pairing.reviewCapability',
} as const;
const permissionKinds = ['allow', 'deny', 'delegateAllow', 'delegateDeny'] as const;
const kindLabels = {
  allow: 'pairing.allow',
  deny: 'pairing.deny',
  delegateAllow: 'pairing.delegateAllow',
  delegateDeny: 'pairing.delegateDeny',
} as const;
function editable(cap: PairingCapability): cap is (typeof capabilities)[number] {
  return cap === 'approve' || cap === 'reject' || cap === 'review-pairing';
}
function choices(value: PermissionChoices) {
  return {
    allow: value.allow.filter(editable),
    deny: value.deny.filter(editable),
    delegateAllow: (value.delegateAllow ?? []).filter(editable),
    delegateDeny: (value.delegateDeny ?? []).filter(editable),
  };
}
export type GroupBinding = { id: string; name: string };

function PermissionEditor({
  value,
  change,
  busy,
  t,
}: {
  value: PermissionChoices;
  change(value: PermissionChoices): void;
  busy: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <fieldset disabled={busy} className="bh-im-role-form">
      <legend className="bh-im-actions">
        {t('pairing.roleCapabilities')}
        <MessagingHelp
          title={t('pairing.roleCapabilities')}
          text={t('pairing.delegationHelp')}
          t={t}
        />
      </legend>
      <table className="bh-pairing-table bh-permission-table">
        <thead>
          <tr>
            <th>{t('pairing.roleCapabilities')}</th>
            {permissionKinds.map((kind) => (
              <th key={kind}>{t(kindLabels[kind])}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {capabilities.map((capability) => (
            <tr key={capability}>
              <td>{t(capabilityLabel[capability])}</td>
              {permissionKinds.map((kind) => (
                <td key={kind}>
                  <Checkbox
                    label={`${t(kindLabels[kind])} · ${t(capabilityLabel[capability])}`}
                    checked={(value[kind] ?? []).includes(capability)}
                    disabled={busy}
                    onChange={(checked) => {
                      const opposite =
                        kind === 'allow'
                          ? 'deny'
                          : kind === 'deny'
                            ? 'allow'
                            : kind === 'delegateAllow'
                              ? 'delegateDeny'
                              : 'delegateAllow';
                      change({
                        ...value,
                        [kind]: checked
                          ? [...(value[kind] ?? []), capability]
                          : (value[kind] ?? []).filter((item) => item !== capability),
                        ...(checked
                          ? {
                              [opposite]: (value[opposite] ?? []).filter(
                                (item) => item !== capability,
                              ),
                            }
                          : {}),
                      });
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}

export function PersonPermissions({
  request,
  selectGroup,
  busy,
  change,
  t,
}: {
  request: PairingRequest;
  selectGroup?: ((id: string) => void) | undefined;
  busy: boolean;
  change(input: SenderAccessInput): Promise<void>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<PermissionChoices>(
    request.permissionExceptions ?? { allow: [], deny: [] },
  );
  const [failed, setFailed] = useState(false);
  const effective = request.effectivePermissions;
  return (
    <>
      <div className="bh-im-actions">
        <strong>{t('pairing.effectivePermissions')}</strong>
        <MessagingHelp
          title={t('pairing.effectivePermissions')}
          text={t('pairing.groupHelp')}
          t={t}
        />
      </div>
      {effective ? (
        <>
          <div className="bh-im-pairing-capabilities">
            {effective.capabilities.length ? (
              effective.capabilities.map((capability) => <Tag key={capability}>{capability}</Tag>)
            ) : (
              <Tag>{t('pairing.ordinary')}</Tag>
            )}
          </div>
          <div className="bh-im-actions">
            <strong>{t('pairing.delegable')}</strong>
            <span>{effective.delegableCapabilities?.join(', ') || '—'}</span>
            <MessagingHelp
              title={t('pairing.delegable')}
              text={t('pairing.delegationHelp')}
              t={t}
            />
          </div>
          <table
            className="bh-pairing-table bh-permission-table"
            aria-label={t('pairing.permissionSources')}
          >
            <thead>
              <tr>
                <th>{t('pairing.permissionSources')}</th>
                <th>{t('pairing.allow')}</th>
                <th>{t('pairing.deny')}</th>
                <th>{t('pairing.delegateAllow')}</th>
                <th>{t('pairing.delegateDeny')}</th>
              </tr>
            </thead>
            <tbody>
              {effective.permissionSources.map((source) => (
                <tr key={`${source.kind}:${source.id}`}>
                  <td>
                    <span title={source.id}>
                      {t(`pairing.source.${source.kind}`)} · {source.name}
                    </span>
                    <div className="bh-muted">r{source.revision}</div>
                  </td>
                  <td>{source.allow.join(', ') || '—'}</td>
                  <td>{source.deny.join(', ') || '—'}</td>
                  <td>{source.delegateAllow?.join(', ') || '—'}</td>
                  <td>{source.delegateDeny?.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {effective.behaviorPermissions?.length ? (
            <>
              <strong>{t('pairing.behaviorPermissions')}</strong>
              <MessagingHelp
                title={t('pairing.behaviorPermissions')}
                text={t('pairing.behaviorHelp')}
                t={t}
              />
              <BehaviorResult
                items={effective.behaviorPermissions}
                selectGroup={selectGroup}
                t={t}
              />
            </>
          ) : null}
        </>
      ) : null}
      <Button size="sm" variant="toolbar" disabled={busy} onClick={() => setEditing(true)}>
        {t('pairing.personExceptions')}
      </Button>
      {editing ? (
        <Modal
          open
          onClose={() => {
            if (!busy) setEditing(false);
          }}
          title={t('pairing.personExceptions')}
          closeLabel={t('common.close')}
          className="bh-sidebar-modal bh-pairing-role-modal"
          contentClassName="bh-pairing-content"
          footer={
            <div className="bh-modal-footer">
              <Button size="sm" variant="toolbar" disabled={busy} onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => {
                  setFailed(false);
                  void change({
                    kind: 'person-permissions',
                    id: request.id,
                    expectedRevision: request.revision,
                    ...choices(value),
                  })
                    .then(() => setEditing(false))
                    .catch(() => setFailed(true));
                }}
              >
                {t('pairing.savePermissions')}
              </Button>
            </div>
          }
        >
          <strong>{request.actorName ?? request.actorId}</strong>
          <PermissionEditor value={value} change={setValue} busy={busy} t={t} />
          {failed ? (
            <p role="alert" className="bh-error">
              {t('pairing.error')}
            </p>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}

export function GroupDetails({
  group,
  behaviorPermissions = [],
  groups = [],
  people,
  bindings,
  busy,
  change,
  t,
}: {
  group: ExternalPermissionGroup;
  behaviorPermissions?: BehaviorPermission[];
  groups?: ExternalPermissionGroup[];
  people: PairingRequest[];
  bindings: GroupBinding[];
  busy: boolean;
  change?: ((input: SenderAccessInput) => Promise<void>) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const afterDeletion = groups.filter((entry) => entry.id !== group.id);
  const deleteIncompatible =
    configuredBehaviorConflicts(behaviorPermissions, afterDeletion, people).length > 0;
  return (
    <article className="bh-im-pairing-request">
      <strong>{group.name}</strong>
      <p>
        {bindings.find((binding) => binding.id === group.bindingId)?.name ?? group.bindingId} · r
        {group.revision}
      </p>
      <dl>
        <div>
          <dt>{t('pairing.allow')}</dt>
          <dd>{group.allow.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt>{t('pairing.deny')}</dt>
          <dd>{group.deny.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt>{t('pairing.delegateAllow')}</dt>
          <dd>{group.delegateAllow?.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt>{t('pairing.delegateDeny')}</dt>
          <dd>{group.delegateDeny?.join(', ') || '—'}</dd>
        </div>
      </dl>
      {behaviorPermissions
        .filter((item) =>
          [...(group.behaviorAllow ?? []), ...(group.behaviorDeny ?? [])].includes(item.id),
        )
        .map((item) => (
          <div key={item.id}>
            {item.name} ·{' '}
            {t(group.behaviorDeny?.includes(item.id) ? 'pairing.deny' : 'pairing.allow')} · r
            {item.revision}
          </div>
        ))}
      <strong>{t('pairing.groupMembers')}</strong>
      <ul>
        {people
          .filter((person) => group.memberIds.includes(person.id) && person.status === 'approved')
          .map((person) => (
            <li key={person.id}>{person.actorName ?? person.actorId}</li>
          ))}
      </ul>
      {group.available === false ? <Tag>{t('pairing.unavailable')}</Tag> : null}
      {change ? (
        <div className="bh-im-actions">
          <Button
            size="sm"
            variant="toolbar"
            disabled={busy || group.available === false}
            onClick={() => setEditing(true)}
          >
            {t('pairing.editGroup')}
          </Button>
          <Button size="sm" variant="toolbar" disabled={busy} onClick={() => setDeleting(true)}>
            {t('pairing.deleteGroup')}
          </Button>
        </div>
      ) : null}
      {deleting && change ? (
        <Modal
          open
          onClose={() => {
            if (!busy) setDeleting(false);
          }}
          title={t('pairing.deleteGroup')}
          closeLabel={t('common.close')}
          className="bh-sidebar-modal bh-pairing-role-modal"
          contentClassName="bh-pairing-content"
          footer={
            <div className="bh-modal-footer">
              <Button
                size="sm"
                variant="toolbar"
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={busy || deleteIncompatible}
                onClick={() => {
                  setDeleteFailed(false);
                  void change({
                    kind: 'delete-group',
                    id: group.id,
                    expectedRevision: group.revision,
                  })
                    .then(() => setDeleting(false))
                    .catch(() => setDeleteFailed(true));
                }}
              >
                {t('pairing.deleteGroup')}
              </Button>
            </div>
          }
        >
          <strong>{group.name}</strong>
          <p>{t('pairing.deleteGroupWarning')}</p>
          <BehaviorCompatibility
            items={behaviorPermissions}
            groups={afterDeletion}
            people={people}
            t={t}
          />
          {behaviorPermissions.length ? (
            <BehaviorPreview
              items={behaviorPermissions}
              groups={groups.filter((entry) => entry.id !== group.id)}
              people={people.filter((person) => group.memberIds.includes(person.id))}
              t={t}
            />
          ) : null}
          {deleteFailed ? (
            <p role="alert" className="bh-error">
              {t('pairing.error')}
            </p>
          ) : null}
        </Modal>
      ) : null}
      {editing && change ? (
        <GroupDialog
          behaviorPermissions={behaviorPermissions}
          groups={groups}
          group={group}
          people={people}
          bindings={bindings}
          busy={busy}
          change={change}
          close={() => setEditing(false)}
          t={t}
        />
      ) : null}
    </article>
  );
}

export function GroupDialog({
  group,
  behaviorPermissions = [],
  groups = [],
  people,
  bindings,
  busy,
  change,
  close,
  t,
}: {
  group?: ExternalPermissionGroup;
  behaviorPermissions?: BehaviorPermission[];
  groups?: ExternalPermissionGroup[];
  people: PairingRequest[];
  bindings: GroupBinding[];
  busy: boolean;
  change(input: SenderAccessInput): Promise<void>;
  close(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const [tab, setTab] = useState<'management' | 'behavior' | 'members'>(
    behaviorPermissions.length ? 'behavior' : 'management',
  );
  const [name, setName] = useState(group?.name ?? '');
  const [bindingId, setBindingId] = useState(group?.bindingId ?? bindings[0]?.id ?? '');
  const eligible = people.filter(
    (person) =>
      person.status === 'approved' &&
      person.purpose === 'conversation' &&
      person.bindingId === bindingId,
  );
  const [members, setMembers] = useState<string[]>(
    group?.memberIds.filter((id) => eligible.some((person) => person.id === id)) ?? [],
  );
  const [value, setValue] = useState<PermissionChoices>({
    allow: group?.allow ?? [],
    deny: group?.deny ?? [],
    delegateAllow: group?.delegateAllow ?? [],
    delegateDeny: group?.delegateDeny ?? [],
  });
  const [failed, setFailed] = useState(false);
  const [behaviorValue, setBehaviorValue] = useState<BehaviorChoices>({
    behaviorAllow: group?.behaviorAllow ?? [],
    behaviorDeny: group?.behaviorDeny ?? [],
  });
  const proposedGroups: ExternalPermissionGroup[] = [
    ...groups.filter((existing) => existing.id !== group?.id),
    {
      id: group?.id ?? 'draft',
      botSlug: group?.botSlug ?? '',
      bindingId,
      name,
      revision: group?.revision ?? 1,
      memberIds: members,
      ...value,
      ...behaviorValue,
      createdAt: group?.createdAt ?? '',
      updatedAt: group?.updatedAt ?? '',
    },
  ];
  const incompatible =
    configuredBehaviorConflicts(behaviorPermissions, proposedGroups, people).length > 0;
  const columns: ColumnDef<PairingRequest>[] = [
    {
      id: 'name',
      accessorFn: (person) => person.actorName ?? person.actorId,
      header: t('pairing.actor'),
    },
  ];
  const submit = async () => {
    setFailed(false);
    const selectedChoices = {
      name,
      ...choices(value),
      memberIds: members,
      ...(behaviorPermissions.length ||
      (group?.behaviorAllow?.length ?? 0) ||
      (group?.behaviorDeny?.length ?? 0)
        ? {
            ...behaviorValue,
            expectedBehaviorRevisions: Object.fromEntries(
              behaviorPermissions.map((item) => [item.id, item.revision]),
            ),
          }
        : {}),
    };
    try {
      await change(
        group
          ? {
              kind: 'edit-group',
              id: group.id,
              expectedRevision: group.revision,
              ...selectedChoices,
            }
          : { kind: 'create-group', bindingId, ...selectedChoices },
      );
      close();
    } catch {
      setFailed(true);
    }
  };
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) close();
      }}
      title={t(group ? 'pairing.editGroup' : 'pairing.createGroup')}
      closeLabel={t('common.close')}
      className="bh-sidebar-modal bh-pairing-modal bh-group-editor-modal"
      contentClassName="bh-pairing-content bh-group-editor-content"
      footer={
        <div className="bh-modal-footer">
          <Button size="sm" variant="toolbar" disabled={busy} onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !name.trim() || !bindingId || members.length > 100 || incompatible}
            onClick={() => void submit()}
          >
            {t('pairing.saveGroup')}
          </Button>
        </div>
      }
    >
      <fieldset disabled={busy} className="bh-group-editor-header">
        <label className="bh-im-field">
          <span>{t('pairing.groupName')}</span>
          <Input
            data-modal-autofocus
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <Combobox
          label={t('pairing.account')}
          toggleLabel={t('pairing.account')}
          value={bindingId}
          fallbackValue=""
          disabled={busy || !!group}
          options={bindings.map((binding) => ({ value: binding.id, label: binding.name }))}
          onSelect={(id) => {
            setBindingId(id);
            setMembers([]);
          }}
        />
      </fieldset>
      <div className="bh-pairing-workspace">
        <section className="bh-group-editor-selection">
          <SegmentedTabs
            label={t('pairing.groupConfiguration')}
            value={tab}
            onChange={setTab}
            items={[
              {
                value: 'management',
                label: t('pairing.groupManagement'),
                id: `${id}-management`,
                panelId: `${id}-panel-management`,
              },
              {
                value: 'behavior',
                label: `${t('pairing.behaviorPermissions')} (${[...new Set([...(behaviorValue.behaviorAllow ?? []), ...(behaviorValue.behaviorDeny ?? [])])].length})`,
                id: `${id}-behavior`,
                panelId: `${id}-panel-behavior`,
              },
              {
                value: 'members',
                label: `${t('pairing.groupMembers')} (${members.length})`,
                id: `${id}-members`,
                panelId: `${id}-panel-members`,
              },
            ]}
          />
          <div
            role="tabpanel"
            id={`${id}-panel-${tab}`}
            aria-labelledby={`${id}-${tab}`}
            className="bh-pairing-panel"
          >
            {tab === 'management' ? (
              <PermissionEditor value={value} change={setValue} busy={busy} t={t} />
            ) : tab === 'behavior' ? (
              <BehaviorSelection
                items={behaviorPermissions}
                value={behaviorValue}
                change={setBehaviorValue}
                busy={busy}
                t={t}
              />
            ) : (
              <div className="bh-group-members">
                <PairingTable
                  key={bindingId}
                  data={eligible}
                  columns={columns}
                  selectedIds={members}
                  disabled={busy}
                  select={(person) => {
                    if (!busy)
                      setMembers((ids) =>
                        ids.includes(person.id)
                          ? ids.filter((id) => id !== person.id)
                          : ids.length < 100
                            ? [...ids, person.id]
                            : ids,
                      );
                  }}
                  label={t('pairing.groupMembers')}
                  empty={t('pairing.noPeople')}
                  t={t}
                />
              </div>
            )}
          </div>
        </section>
        <aside className="bh-pairing-detail" aria-label={t('pairing.behaviorPreview')}>
          <BehaviorCompatibility
            items={behaviorPermissions}
            groups={proposedGroups}
            people={people}
            t={t}
          />
          <BehaviorPreview
            items={behaviorPermissions}
            groups={proposedGroups}
            people={people.filter((person) =>
              [...members, ...(group?.memberIds ?? [])].includes(person.id),
            )}
            t={t}
          />
        </aside>
      </div>
      {failed ? (
        <p role="alert" className="bh-error">
          {t('pairing.error')}
        </p>
      ) : null}
    </Modal>
  );
}
