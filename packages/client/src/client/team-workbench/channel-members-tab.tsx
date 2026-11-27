import type { ReactElement } from 'react';

import { PanelEmptyState } from '../ds/empty-state.js';
import { Icon } from '../ds/icon.js';
import { SettingsRow, SettingsSection } from '../ds/settings-row.js';
import type { ChannelTabProps } from './channel-tabs.js';

export function ChannelMembersTab({ t, channel, botName }: ChannelTabProps): ReactElement {
  const humans = channel.humanMembers ?? [];
  if (humans.length === 0 && channel.members.length === 0)
    return <PanelEmptyState icon="users">{t('team.workbench.channels.noMembers')}</PanelEmptyState>;
  return (
    <>
      {humans.length === 0 ? null : (
        <SettingsSection title={t('team.workbench.channels.people')}>
          {humans.map((human) => (
            <SettingsRow
              key={human.humanId}
              icon={<Icon name="user" />}
              title={human.displayName}
              data={{ 'data-team-channel-human': human.humanId }}
            />
          ))}
        </SettingsSection>
      )}
      {channel.members.length === 0 ? null : (
        <SettingsSection title={t('channelBots.tab')}>
          {channel.members.map((slug) => (
            <SettingsRow
              key={slug}
              icon={<Icon name="bot" />}
              title={botName(slug)}
              data={{ 'data-team-channel-bot': slug }}
            />
          ))}
        </SettingsSection>
      )}
    </>
  );
}
