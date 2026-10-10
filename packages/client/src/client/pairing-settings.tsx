import { useState, type ReactElement } from 'react';
import { Button, Checkbox, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { Combobox } from './combobox.js';
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

const capabilities = ['approve', 'reject', 'answer', 'save-rules'] as const;
const labels = {
  approve: 'pairing.approveCapability',
  reject: 'pairing.rejectCapability',
  answer: 'pairing.answerCapability',
  'save-rules': 'pairing.rulesCapability',
} as const;
export function PairingSettings({
  requests,
  receivers = [],
  roles = [],
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
  policy?: SenderPolicy;
  senderAccess?(input: SenderAccessInput): Promise<void>;
  receivers?: { name: string; status: 'off' | 'connecting' | 'receiving' | 'unavailable' }[];
  busy: boolean;
  failed?: boolean;
  refresh(): Promise<void>;
  review(input: PairingReviewInput): Promise<void>;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <section className="bh-im-pairing" aria-label={t('pairing.title')}>
      <div className="bh-im-actions">
        <Button size="sm" variant="toolbar" disabled={busy} onClick={() => void refresh()}>
          {t('pairing.refresh')}
        </Button>
      </div>
      <p className="bh-muted">{t('pairing.hint')}</p>
      {senderAccess && policy ? (
        <RoleSettings roles={roles} policy={policy} busy={busy} change={senderAccess} t={t} />
      ) : null}
      {failed ? (
        <p className="bh-error" role="alert">
          {t('pairing.error')}
        </p>
      ) : null}
      {receivers.map((receiver) => (
        <p key={receiver.name} role="status">
          {receiver.name} · {t(`pairing.receiver.${receiver.status}`)}
        </p>
      ))}
      {requests.length === 0 ? (
        <p className="bh-muted">{t('pairing.empty')}</p>
      ) : (
        requests.map((request) => (
          <PairingRow
            key={`${request.id}:${request.revision}`}
            request={request}
            roles={roles}
            busy={busy}
            review={review}
            t={t}
          />
        ))
      )}
    </section>
  );
}
function PairingRow({
  request,
  roles,
  busy,
  review,
  t,
}: {
  request: PairingRequest;
  roles: ExternalUserRole[];
  busy: boolean;
  review(input: PairingReviewInput): Promise<void>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [selected, setSelected] = useState<PairingCapability[]>([]);
  const [roleId, setRoleId] = useState('');
  const selectedRole = roles.find((role) => role.id === roleId);
  const assignedRole = roles.find((role) => role.id === request.roleId);
  const input = { id: request.id, expectedRevision: request.revision };
  return (
    <article className="bh-im-pairing-request">
      <div className="bh-im-actions">
        <strong>{request.actorName ?? t('pairing.unknownName')}</strong>
        <Tag>{t(`pairing.${request.status}`)}</Tag>
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
      <p className="bh-muted">{t('pairing.scope')}</p>
      {request.purpose === 'conversation' ? (
        <p>{assignedRole?.name ?? t('pairing.conversationAccess')}</p>
      ) : (
        <p className="bh-muted">{t('pairing.managementAccess')}</p>
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
                  hint: t('pairing.ordinary'),
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
        </>
      ) : null}
    </article>
  );
}

function RoleSettings({
  roles,
  policy,
  busy,
  change,
  t,
}: {
  roles: ExternalUserRole[];
  policy: SenderPolicy;
  busy: boolean;
  change(input: SenderAccessInput): Promise<void>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [name, setName] = useState('');
  const [behavior, setBehavior] = useState('');
  return (
    <>
      <Checkbox
        label={t('pairing.restricted')}
        checked={policy.restricted}
        disabled={busy}
        onChange={(restricted) =>
          void change({ kind: 'policy', restricted, expectedRevision: policy.revision })
        }
      />
      <p className="bh-muted">{t('pairing.policyLimit')}</p>
      <fieldset disabled={busy} className="bh-im-role-form">
        <legend>{t('pairing.createRole')}</legend>
        <label className="bh-im-field">
          <span>{t('pairing.roleName')}</span>
          <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="bh-im-field">
          <span>{t('pairing.behavior')}</span>
          <Input
            value={behavior}
            maxLength={2000}
            onChange={(event) => setBehavior(event.target.value)}
          />
        </label>
        <p className="bh-muted">{t('pairing.ordinary')}</p>
        <Button
          size="sm"
          disabled={busy || !name.trim() || !behavior.trim()}
          onClick={() => void change({ kind: 'create-role', name, behavior })}
        >
          {t('pairing.createRole')}
        </Button>
      </fieldset>
      {roles.map((role) => (
        <article className="bh-im-pairing-request" key={role.id}>
          <strong>{role.name}</strong>
          <p>{role.behavior}</p>
          <Tag>{t('pairing.ordinary')}</Tag>
        </article>
      ))}
    </>
  );
}
