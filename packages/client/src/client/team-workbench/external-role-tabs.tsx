import { useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import type {
  ExternalRoleBotScope,
  HostExternalRole,
  HostExternalRoleChange,
} from '@botharness/host-client/external-roles';
import type { BridgeCall } from '../bridge.js';
import { Button } from '../ds/button.js';
import { Icon } from '../ds/icon.js';
import { TextAreaField } from '../ds/field.js';
import { SegmentedControl } from '../ds/segmented.js';
import { SettingsRow, SettingsSection } from '../ds/settings-row.js';
import { Switch } from '../ds/switch.js';
import { Tag } from '../ds/tag.js';
import { space } from '../ds/tobs.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from '../locale.js';
import { RolePolicyField, type PolicyRow } from '../role-policy-field.js';
import { ExternalRoleContacts } from './external-role-contacts.js';
import {
  CAPABILITY_LABEL,
  capabilityChoice,
  coversBot,
  pairingCapabilities,
  withBot,
  withCapability,
} from './external-role-model.js';
import type { BotEntry } from './external-roles-section.js';
import type { PermissionChoice } from './permission-model.js';

const BEHAVIOR_LIMIT = 4000;
const EXTERNAL_EFFECTS = ['allow', 'ask', 'deny'] as const;
const EXTERNAL_EFFECT_LABEL = {
  allow: 'team.workbench.allow',
  ask: 'team.policy.ask',
  deny: 'team.workbench.deny',
} as const;

const styles = stylex.create({
  actions: { display: 'flex', gap: space.x3 },
  body: { display: 'flex', flexDirection: 'column', gap: space.x5 },
});

export type ExternalRoleTabId = 'bots' | 'capabilities' | 'behavior' | 'contacts';

export type ExternalRolePatch = Omit<
  Extract<HostExternalRoleChange, { kind: 'update' }>,
  'kind' | 'id' | 'expectedRevision'
>;

export interface ExternalRoleTabProps {
  readonly call: BridgeCall;
  readonly t: BotHarnessTranslate;
  readonly role: HostExternalRole;
  readonly bots: readonly BotEntry[];
  readonly botName: (slug: string) => string;
  readonly busy: boolean;
  readonly update: (
    role: HostExternalRole,
    patch: ExternalRolePatch,
  ) => Promise<HostExternalRole | undefined>;
}

export interface ExternalRoleTab {
  readonly id: ExternalRoleTabId;
  readonly label: BotHarnessKey;
  render(props: ExternalRoleTabProps): ReactNode;
}

export const EXTERNAL_ROLE_TABS: readonly ExternalRoleTab[] = [
  {
    id: 'bots',
    label: 'team.externalRoles.tab.bots',
    render: (props) => <BotScopeTab {...props} />,
  },
  {
    id: 'capabilities',
    label: 'team.externalRoles.tab.capabilities',
    render: (props) => <CapabilitiesTab {...props} />,
  },
  {
    id: 'behavior',
    label: 'team.externalRoles.tab.behavior',
    render: (props) => <BehaviorTab key={`${props.role.id}:${props.role.revision}`} {...props} />,
  },
  {
    id: 'contacts',
    label: 'team.externalRoles.tab.contacts',
    render: ({ call, t, role, botName, bots }) => (
      <ExternalRoleContacts
        key={`${role.id}:${role.revision}`}
        call={call}
        t={t}
        role={role}
        bots={bots}
        botName={botName}
      />
    ),
  },
];

function BotScopeTab({ t, role, bots, botName, busy, update }: ExternalRoleTabProps): ReactElement {
  const scope = role.botScope;
  const known = new Set(bots.map((bot) => bot.slug));
  const missing = scope.kind === 'only' ? scope.botSlugs.filter((slug) => !known.has(slug)) : [];
  const setScope = (botScope: ExternalRoleBotScope): void => void update(role, { botScope });
  return (
    <SettingsSection
      title={t('team.externalRoles.bots')}
      description={t('team.externalRoles.botsHint')}
      action={<Tag tone="info">{t('team.workbench.enforced')}</Tag>}
      data={{ 'data-external-role-scope': scope.kind }}
    >
      <SettingsRow
        title={t('team.externalRoles.scope.title')}
        description={
          scope.kind === 'all'
            ? t('team.externalRoles.scope.allHint')
            : scope.botSlugs.length === 0
              ? t('team.externalRoles.scope.noneHint')
              : undefined
        }
        control={
          <SegmentedControl<ExternalRoleBotScope['kind']>
            id={`external-role-scope-${role.id}`}
            label={t('team.externalRoles.scope.title')}
            value={scope.kind}
            disabled={busy}
            options={[
              { value: 'only', label: t('team.externalRoles.scope.only') },
              { value: 'all', label: t('team.externalRoles.scope.all') },
            ]}
            onChange={(kind) =>
              setScope(
                kind === 'all'
                  ? { kind: 'all' }
                  : { kind: 'only', botSlugs: bots.map((bot) => bot.slug) },
              )
            }
          />
        }
      />
      {bots.map((bot) => (
        <SettingsRow
          key={bot.slug}
          icon={<Icon name="bot" />}
          title={bot.name}
          data={{
            'data-external-role-bot': bot.slug,
            'data-covered': String(coversBot(scope, bot.slug)),
          }}
          control={
            <Switch
              label={bot.name}
              checked={coversBot(scope, bot.slug)}
              disabled={busy || scope.kind === 'all'}
              onChange={(included) => setScope(withBot(scope, bot.slug, included))}
            />
          }
        />
      ))}
      {missing.map((slug) => (
        <SettingsRow
          key={slug}
          icon={<Icon name="bot" />}
          title={botName(slug)}
          description={t('team.externalRoles.botGone')}
          data={{ 'data-external-role-bot': slug, 'data-covered': 'true' }}
          control={
            <Switch
              label={botName(slug)}
              checked
              disabled={busy}
              onChange={() => setScope(withBot(scope, slug, false))}
            />
          }
        />
      ))}
    </SettingsSection>
  );
}

function CapabilitiesTab({ t, role, busy, update }: ExternalRoleTabProps): ReactElement {
  return (
    <SettingsSection
      title={t('team.externalRoles.capabilities')}
      description={t('team.workbench.denyWins')}
      action={<Tag tone="info">{t('team.workbench.enforced')}</Tag>}
    >
      {pairingCapabilities.map((capability) => {
        const label = t(CAPABILITY_LABEL[capability]);
        return (
          <SettingsRow
            key={capability}
            title={label}
            data={{ 'data-external-role-capability': capability }}
            control={
              <SegmentedControl<PermissionChoice>
                id={`external-role-capability-${role.id}-${capability}`}
                label={label}
                value={capabilityChoice(role, capability)}
                disabled={busy}
                options={[
                  { value: 'allow', label: t('team.workbench.allow') },
                  { value: 'unset', label: t('team.workbench.unset') },
                  { value: 'deny', label: t('team.workbench.deny') },
                ]}
                onChange={(choice) => void update(role, withCapability(role, capability, choice))}
              />
            }
          />
        );
      })}
    </SettingsSection>
  );
}

type ExternalEffect = (typeof EXTERNAL_EFFECTS)[number];

function policyReady(policy: readonly PolicyRow<ExternalEffect>[]): boolean {
  return policy.every((row) => row.topic.trim() !== '' && row.text.trim() !== '');
}

function BehaviorTab({ t, role, busy, update }: ExternalRoleTabProps): ReactElement {
  const [policy, setPolicy] = useState<PolicyRow<ExternalEffect>[]>(role.policy);
  const [behavior, setBehavior] = useState(role.behavior);
  const dirty =
    behavior !== role.behavior || JSON.stringify(policy) !== JSON.stringify(role.policy);
  return (
    <div {...stylex.props(styles.body)} data-external-role-behavior="">
      <RolePolicyField<ExternalEffect>
        t={t}
        title={t('team.externalRoles.policy')}
        hint={t('team.externalRoles.policyHint')}
        value={policy}
        effects={EXTERNAL_EFFECTS}
        effectLabels={EXTERNAL_EFFECT_LABEL}
        disabled={busy}
        onChange={setPolicy}
      />
      <TextAreaField
        label={t('team.externalRoles.instructions')}
        value={behavior}
        onChange={setBehavior}
        maxLength={BEHAVIOR_LIMIT}
        rows={4}
        disabled={busy}
        data-external-role-instructions=""
      />
      <div {...stylex.props(styles.actions)}>
        <Button
          variant="primary"
          disabled={busy || !dirty || !policyReady(policy)}
          data-external-role-save=""
          onClick={() =>
            void update(role, {
              behavior: behavior.trim(),
              policy: policy.map((row) => ({
                ...row,
                topic: row.topic.trim(),
                text: row.text.trim(),
              })),
            })
          }
        >
          {t('team.save')}
        </Button>
        <Button
          variant="outline"
          disabled={busy || !dirty}
          onClick={() => {
            setPolicy(role.policy);
            setBehavior(role.behavior);
          }}
        >
          {t('team.externalRoles.discard')}
        </Button>
      </div>
    </div>
  );
}
