import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import type { RosterBot } from '@botharness/host-client/client';
import type { HostCall } from '@botharness/host-client/host-answer';
import {
  changeRole,
  externalContacts,
  reviewPairing,
  type ExternalUserRole,
  type MessagingSnapshot,
  type PairingRequest,
} from '../../host/messaging-settings';
import { SHEET_GROUP } from '../chat/sheet';
import { confirmAppDialog } from '../primitives/app-dialog';
import { SettingsForm, SettingsFormItem } from '../primitives/settings-form';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { LoadFailed, Loading, Notice, errorText } from '../request-parts';
import { useStrings } from '../strings';
import { ImPlatformIcon } from './im-platform-icon';
import { staleChange, useFocusedResource } from './use-resource';

type Strings = ReturnType<typeof useStrings>;

const CAPABILITIES = ['approve', 'reject', 'answer', 'save-rules', 'review-pairing'] as const;
const HISTORY_LIMIT = 10;

export function personName(t: Strings, pairing: PairingRequest): string {
  return pairing.actorName ?? t.externalContacts.unknownPerson;
}

function roleName(t: Strings, snapshot: MessagingSnapshot, pairing: PairingRequest): string {
  if (pairing.purpose !== 'conversation') return t.externalContacts.management;
  return (
    snapshot.roles?.find((role) => role.id === pairing.roleId)?.name ?? t.externalContacts.noRole
  );
}

function when(value: string | undefined): string {
  if (value === undefined) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ExternalContactsScreen({
  host,
  bot,
  onBind,
  onOpen,
}: {
  host: HostCall;
  bot: RosterBot;
  onBind: () => void;
  onOpen: (pairing: PairingRequest) => void;
}) {
  const t = useStrings();
  const copy = t.externalContacts;
  const source = useMemo(() => externalContacts(host, bot.slug), [host, bot.slug]);
  const loaded = useFocusedResource(source);
  if (loaded.status === 'loading')
    return (
      <SettingsForm>
        <SettingsFormItem>
          <Loading />
        </SettingsFormItem>
      </SettingsForm>
    );
  if (loaded.status === 'failed')
    return (
      <SettingsForm>
        <SettingsFormItem>
          <LoadFailed error={errorText(loaded.error)} onRetry={() => void source.load()} />
        </SettingsFormItem>
      </SettingsForm>
    );
  const snapshot = loaded.value;
  const identities = (snapshot.identities ?? []).filter((item) => item.revokedAt === undefined);
  const pairings = [...(snapshot.pairings ?? [])].sort((a, b) =>
    (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
  );
  const pending = pairings.filter((item) => item.status === 'pending');
  const approved = pairings.filter((item) => item.status === 'approved');
  const history = pairings
    .filter((item) => item.status !== 'pending' && item.status !== 'approved')
    .slice(0, HISTORY_LIMIT);
  const row = (pairing: PairingRequest) => (
    <SettingsRow
      key={pairing.id}
      on={SHEET_GROUP}
      testID={`pairing-${pairing.id}`}
      leading={
        <ImPlatformIcon
          platform={snapshot.identities?.find((item) => item.id === pairing.bindingId)?.platform}
        />
      }
      title={personName(t, pairing)}
      detail={`${pairing.accountName} · ${
        pairing.conversationKind === 'group' ? t.pairingRequest.group : t.pairingRequest.dm
      }`}
      control={{
        kind: 'value',
        text:
          pairing.status === 'approved'
            ? roleName(t, snapshot, pairing)
            : copy.status(pairing.status),
        chevron: true,
      }}
      onPress={() => onOpen(pairing)}
    />
  );
  return (
    <SettingsForm testID="external-contacts">
      {loaded.error === undefined ? null : (
        <SettingsFormItem>
          <Notice tone="danger">{`${copy.loadFailed} ${errorText(loaded.error)}`}</Notice>
        </SettingsFormItem>
      )}
      <SettingsSection on={SHEET_GROUP} title={copy.identities} footer={copy.identitiesHint}>
        {identities.length === 0 ? (
          <SettingsRow on={SHEET_GROUP} title={copy.noIdentities} tone="muted" />
        ) : (
          identities.map((identity) => (
            <SettingsRow
              key={identity.id}
              on={SHEET_GROUP}
              testID={`external-identity-${identity.id}`}
              leading={<ImPlatformIcon platform={identity.platform} />}
              title={identity.name}
              detail={`${t.imApps.platform(identity.platform)} · ${
                loaded.checking && identity.reception === undefined
                  ? t.imApps.checking
                  : copy.reception(identity.reception ?? (identity.enabled ? 'connecting' : 'off'))
              }`}
            />
          ))
        )}
        <SettingsRow
          on={SHEET_GROUP}
          testID="external-bind-app"
          title={t.imApps.bindApp}
          control={{ kind: 'chevron' }}
          onPress={onBind}
        />
      </SettingsSection>
      <SettingsSection on={SHEET_GROUP} title={copy.pending} footer={copy.pendingHint}>
        {pending.length === 0 ? (
          <SettingsRow on={SHEET_GROUP} title={copy.noPending} tone="muted" />
        ) : (
          pending.map(row)
        )}
      </SettingsSection>
      <SettingsSection on={SHEET_GROUP} title={copy.approved}>
        {approved.length === 0 ? (
          <SettingsRow on={SHEET_GROUP} title={copy.noApproved} tone="muted" />
        ) : (
          approved.map(row)
        )}
      </SettingsSection>
      {history.length === 0 ? null : (
        <SettingsSection on={SHEET_GROUP} title={copy.history}>
          {history.map(row)}
        </SettingsSection>
      )}
    </SettingsForm>
  );
}

export function PairingScreen({ host, bot, id }: { host: HostCall; bot: RosterBot; id: string }) {
  const t = useStrings();
  const copy = t.pairingRequest;
  const router = useRouter();
  const source = useMemo(() => externalContacts(host, bot.slug), [host, bot.slug]);
  const loaded = useFocusedResource(source);
  const [chosenRole, setChosenRole] = useState<string>();
  const [chosenCapabilities, setChosenCapabilities] = useState<readonly string[]>();
  const [saving, setSaving] = useState<string>();
  const [failure, setFailure] = useState<string>();
  if (loaded.status === 'loading')
    return (
      <SettingsForm>
        <SettingsFormItem>
          <Loading />
        </SettingsFormItem>
      </SettingsForm>
    );
  const snapshot = loaded.status === 'ready' ? loaded.value : undefined;
  const pairing = snapshot?.pairings?.find((item) => item.id === id);
  if (snapshot === undefined || pairing === undefined)
    return (
      <SettingsForm>
        <SettingsFormItem>
          <LoadFailed
            error={loaded.status === 'failed' ? errorText(loaded.error) : copy.gone}
            onRetry={() => void source.load()}
          />
        </SettingsFormItem>
      </SettingsForm>
    );
  const roles = snapshot.roles ?? [];
  const conversation = pairing.purpose === 'conversation';
  const pending = pairing.status === 'pending';
  const roleId =
    chosenRole ??
    (pending ? (snapshot.senderPolicy?.defaultRoleId ?? roles[0]?.id) : pairing.roleId);
  const selectedRole = roles.find((role) => role.id === roleId);
  const capabilities =
    chosenCapabilities ?? (pending ? ['approve', 'reject'] : pairing.capabilities);
  const name = personName(t, pairing);
  const run = async (key: string, work: () => Promise<unknown>) => {
    if (saving !== undefined) return false;
    setSaving(key);
    setFailure(undefined);
    try {
      await work();
      return true;
    } catch (error) {
      setFailure(staleChange(error) ? copy.changed : `${copy.failed} ${errorText(error)}`);
      setChosenRole(undefined);
      setChosenCapabilities(undefined);
      return false;
    } finally {
      setSaving(undefined);
    }
  };
  const base = { id: pairing.id, expectedRevision: pairing.revision };
  const approve = () =>
    run('approve', () =>
      reviewPairing(
        host,
        bot.slug,
        conversation && selectedRole !== undefined
          ? {
              ...base,
              kind: 'approve',
              roleId: selectedRole.id,
              expectedRoleRevision: selectedRole.revision,
            }
          : {
              ...base,
              kind: 'approve',
              capabilities: CAPABILITIES.filter((item) => capabilities.includes(item)),
            },
      ),
    ).then((done) => {
      if (done) router.back();
    });
  const reject = () =>
    run('reject', () => reviewPairing(host, bot.slug, { ...base, kind: 'reject' })).then((done) => {
      if (done) router.back();
    });
  const revoke = async () => {
    if (!(await confirmAppDialog(copy.revokeTitle(name), copy.revokeBody, copy.revoke))) return;
    const done = await run('revoke', () =>
      reviewPairing(host, bot.slug, { ...base, kind: 'revoke' }),
    );
    if (done) router.back();
  };
  const pickRole = (role: ExternalUserRole) => {
    if (pending) {
      setChosenRole(role.id);
      return;
    }
    if (role.id === pairing.roleId) return;
    setChosenRole(role.id);
    void run(`role:${role.id}`, () => changeRole(host, bot.slug, pairing, role)).then(() =>
      setChosenRole(undefined),
    );
  };
  const editableRole = conversation && (pending || pairing.status === 'approved');
  const ready = conversation ? selectedRole !== undefined : capabilities.length > 0;
  return (
    <SettingsForm testID="pairing-request">
      <SettingsSection on={SHEET_GROUP}>
        <SettingsRow on={SHEET_GROUP} title={copy.person} control={{ kind: 'value', text: name }} />
        <SettingsRow
          on={SHEET_GROUP}
          title={copy.account}
          control={{ kind: 'value', text: pairing.accountName }}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={copy.where}
          control={{
            kind: 'value',
            text: pairing.conversationKind === 'group' ? copy.group : copy.dm,
          }}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={copy.status}
          control={{ kind: 'value', text: t.externalContacts.status(pairing.status) }}
        />
        <SettingsRow
          on={SHEET_GROUP}
          title={pending ? copy.expires : copy.asked}
          control={{ kind: 'value', text: when(pending ? pairing.expiresAt : pairing.createdAt) }}
        />
      </SettingsSection>
      {failure === undefined ? null : (
        <SettingsFormItem>
          <Notice tone="danger">{failure}</Notice>
        </SettingsFormItem>
      )}
      {editableRole ? (
        <SettingsSection
          on={SHEET_GROUP}
          title={copy.role}
          footer={roles.length === 0 ? copy.noRoles : copy.roleHint}
        >
          {roles.map((role) => (
            <SettingsRow
              key={role.id}
              on={SHEET_GROUP}
              testID={`pairing-role-${role.id}`}
              title={role.name}
              detail={
                role.capabilities.length === 0
                  ? role.behavior
                  : `${role.behavior}\n${role.capabilities.map(copy.capability).join(' · ')}`
              }
              selected={role.id === roleId}
              {...(saving === `role:${role.id}`
                ? { control: { kind: 'busy' as const } }
                : role.id === roleId
                  ? { control: { kind: 'check' as const } }
                  : {})}
              onPress={() => pickRole(role)}
            />
          ))}
        </SettingsSection>
      ) : null}
      {!conversation && pending ? (
        <SettingsSection on={SHEET_GROUP} title={copy.capabilities} footer={copy.capabilitiesHint}>
          {CAPABILITIES.map((capability) => (
            <SettingsRow
              key={capability}
              on={SHEET_GROUP}
              title={copy.capability(capability)}
              control={{
                kind: 'switch',
                value: capabilities.includes(capability),
                testID: `pairing-capability-${capability}`,
                onChange: (enabled) =>
                  setChosenCapabilities(
                    enabled
                      ? [...capabilities, capability]
                      : capabilities.filter((item) => item !== capability),
                  ),
              }}
            />
          ))}
        </SettingsSection>
      ) : null}
      {!conversation && pairing.status === 'approved' ? (
        <SettingsSection on={SHEET_GROUP} title={copy.capabilities}>
          {pairing.capabilities.map((capability) => (
            <SettingsRow key={capability} on={SHEET_GROUP} title={copy.capability(capability)} />
          ))}
        </SettingsSection>
      ) : null}
      {pending ? (
        <SettingsSection on={SHEET_GROUP}>
          <SettingsRow
            on={SHEET_GROUP}
            testID="pairing-approve"
            title={copy.approve}
            tone="accent"
            strong
            {...(saving === 'approve' ? { control: { kind: 'busy' as const } } : {})}
            onPress={ready ? () => void approve() : undefined}
          />
          <SettingsRow
            on={SHEET_GROUP}
            testID="pairing-reject"
            title={copy.reject}
            tone="danger"
            {...(saving === 'reject' ? { control: { kind: 'busy' as const } } : {})}
            onPress={() => void reject()}
          />
        </SettingsSection>
      ) : pairing.status === 'approved' ? (
        <SettingsSection on={SHEET_GROUP}>
          <SettingsRow
            on={SHEET_GROUP}
            testID="pairing-revoke"
            title={copy.revoke}
            tone="danger"
            {...(saving === 'revoke' ? { control: { kind: 'busy' as const } } : {})}
            onPress={() => void revoke()}
          />
        </SettingsSection>
      ) : null}
    </SettingsForm>
  );
}
