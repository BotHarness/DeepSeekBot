import type { ReactElement } from 'react';

import { MaskedApprovalCard } from './approval-mask.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import {
  SettingsGroupPart,
  SettingsRow,
  SettingsSection,
  SettingsValue,
} from './ds/settings-row.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ApprovalKey, ChannelPolicy, PolicyValue } from './team-channels-bridge.js';

type Choice = 'allow' | 'deny';

const DEFAULTS: Record<ApprovalKey, Choice> = { seeApprovals: 'allow', decideApprovals: 'deny' };

function choiceOf(policy: ChannelPolicy, key: ApprovalKey): Choice {
  const value: PolicyValue = policy.everyone[key];
  return value === 'inherit' ? DEFAULTS[key] : value;
}

export function ChannelApprovalSettings({
  t,
  policy,
  manager,
  disabled,
  onChange,
}: {
  t: BotHarnessTranslate;
  policy: ChannelPolicy;
  manager: boolean;
  disabled: boolean;
  onChange(policy: ChannelPolicy): void;
}): ReactElement {
  const set = (key: ApprovalKey, value: Choice): void =>
    onChange({
      ...policy,
      approvalMode: 'channel',
      everyone: { ...policy.everyone, [key]: value },
    });
  const row = (
    key: ApprovalKey,
    title: string,
    description: string,
    labels: Record<Choice, string>,
  ) => (
    <SettingsRow
      title={title}
      description={description}
      data={{ 'data-channel-approval-row': key }}
      control={
        manager ? (
          <Select<Choice>
            label={title}
            value={choiceOf(policy, key)}
            disabled={disabled}
            options={[
              { value: 'allow', label: labels.allow },
              { value: 'deny', label: labels.deny },
            ]}
            onChange={(value) => set(key, value)}
          />
        ) : (
          <SettingsValue>{labels[choiceOf(policy, key)]}</SettingsValue>
        )
      }
    />
  );
  return (
    <div data-channel-approvals={policy.approvalMode ?? 'channel'}>
      {policy.approvalMode === 'legacy' && manager ? (
        <Note>{t('channelApprovals.legacy')}</Note>
      ) : null}
      {manager ? null : <Note>{t('channelApprovals.managersOnly')}</Note>}
      <SettingsSection
        title={t('channelApprovals.title')}
        description={t('channelApprovals.byRole')}
      >
        {row('seeApprovals', t('channelApprovals.see'), t('channelApprovals.seeHint'), {
          allow: t('channelApprovals.everyone'),
          deny: t('channelApprovals.tableOnly'),
        })}
        {row('decideApprovals', t('channelApprovals.decide'), t('channelApprovals.decideHint'), {
          allow: t('channelApprovals.everyone'),
          deny: t('channelApprovals.ownersAndTable'),
        })}
        <SettingsRow
          title={t('channelApprovals.unhandled')}
          control={<SettingsValue>{t('channelApprovals.unhandledValue')}</SettingsValue>}
        />
      </SettingsSection>
      <SettingsSection title={t('channelApprovals.preview')}>
        <SettingsGroupPart data={{ 'data-channel-approval-preview': '' }}>
          <MaskedApprovalCard
            t={t}
            approval={{
              masked: true,
              kind: 'tool-approval',
              state: 'pending',
              botSlug: '',
              requestedAt: new Date(0).toISOString(),
            }}
          />
        </SettingsGroupPart>
      </SettingsSection>
    </div>
  );
}
