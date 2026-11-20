import * as stylex from '@stylexjs/stylex';
import {
  ProfileActivitySection,
  ProfileCard,
  ProfilePanel,
  profileStyles,
} from './ds/profile-panel.js';
import { hooked } from './ds/hooked.js';
import { PillButton } from './ds/pill-button.js';
import {
  PersonaBotAvatar,
  personaBotActivityLabel,
  personaBotActivityPreview,
  personaBotPresentationSummary,
  type PersonaBotFacepileItem,
} from './avatar.js';
import { bridgeSourceLabel } from './bridge-source-label.js';
import type { ReactElement } from 'react';

import { Tooltip } from './ds/tooltip.js';

import type { GroupProfileActivity, GroupProfileAuthorActivity } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { ProfileHeatmap, countByDay } from './profile-cards-builtins.js';
import type {
  GroupProfileCardDescriptor,
  GroupProfileCardViewProps,
  ProfileCardRegistry,
} from './profile-cards.js';
import type { ChannelSummary } from './store.js';

function GroupAvatar({
  channel,
  size,
}: {
  channel: ChannelSummary;
  size: 'small' | 'large';
}): ReactElement {
  return (
    <span className={`bh-group-profile-avatar bh-group-profile-avatar-${size}`} aria-hidden="true">
      {channel.avatar === undefined ? '#' : <img src={channel.avatar} alt="" />}
    </span>
  );
}

function authorName(
  entry: GroupProfileAuthorActivity,
  botNames: ReadonlyMap<string, string>,
  t: BotHarnessTranslate,
): string {
  switch (entry.author.kind) {
    case 'bot':
      return botNames.get(entry.author.slug) ?? entry.author.slug;
    case 'remote-bot':
      return entry.author.slug;
    case 'human':
      return t('groupProfile.human');
    case 'bridged':
      return t('groupProfile.external', {
        source: entry.bridgeOrigin ? bridgeSourceLabel(entry.bridgeOrigin, t) : entry.author.source,
      });
    case 'system':
      return t('groupProfile.system');
  }
}

function GroupMessagesCard({ activity, compact, t }: GroupProfileCardViewProps): ReactElement {
  const days = activity?.days ?? [];
  const total = days.reduce((sum, day) => sum + day.count, 0);
  return (
    <div className="bh-profile-card-body">
      <div className="bh-profile-card-total">
        {t('profile.window.total', { weeks: activity?.weeks ?? 26, count: total })}
      </div>
      <ProfileHeatmap
        counts={countByDay(days)}
        label={t('groupProfile.messages')}
        today={activity?.today}
        compact={compact}
        t={t}
      />
    </div>
  );
}

function GroupMembersCard({
  activity,
  botNames,
  compact,
  t,
}: GroupProfileCardViewProps): ReactElement {
  const authors = compact ? (activity?.authors ?? []).slice(0, 3) : (activity?.authors ?? []);
  return (
    <div className="bh-profile-card-body">
      {authors.length === 0 ? (
        <div className="bh-profile-empty">{t('profile.empty')}</div>
      ) : (
        <ul className="bh-group-profile-authors">
          {authors.map((entry) => {
            const key =
              entry.author.kind === 'bot'
                ? `bot:${entry.author.slug}`
                : entry.author.kind === 'bridged'
                  ? entry.bridgeOrigin
                    ? JSON.stringify([
                        'bridged-source',
                        entry.bridgeOrigin.platform,
                        entry.bridgeOrigin.conversationId,
                      ])
                    : `bridged:${entry.author.source}`
                  : entry.author.kind;
            return (
              <li key={key}>
                <span>{authorName(entry, botNames, t)}</span>
                <span className="bh-profile-reason-count">{entry.total}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function createGroupProfileCards(
  t: BotHarnessTranslate,
): readonly GroupProfileCardDescriptor[] {
  return [
    {
      id: 'group-messages',
      label: t('groupProfile.messages'),
      order: 10,
      render: (props) => <GroupMessagesCard {...props} />,
    },
    {
      id: 'group-members',
      label: t('groupProfile.members'),
      order: 20,
      render: (props) => <GroupMembersCard {...props} />,
    },
  ];
}

export interface GroupProfileProps {
  channel: ChannelSummary;
  activity: GroupProfileActivity | undefined;
  cards: ProfileCardRegistry;
  members?: readonly PersonaBotFacepileItem[];
  botNames: ReadonlyMap<string, string>;
  t: BotHarnessTranslate;
}

export function GroupProfileView({
  channel,
  activity,
  cards,
  members = [],
  botNames,
  t,
  onClose,
}: GroupProfileProps & {
  onClose(): void;
}): ReactElement {
  const preview = personaBotActivityPreview(members);
  const remaining = members.length - preview.length;
  return (
    <ProfilePanel backLabel={t('profile.close')} onClose={onClose}>
      <div {...stylex.props(profileStyles.groupIdentity)}>
        <GroupAvatar channel={channel} size="large" />
        <div {...stylex.props(profileStyles.groupHeading)}>
          <h2 {...hooked('bh-profile-view-name', profileStyles.title)}>{channel.name}</h2>
          <span {...stylex.props(profileStyles.caption)}>
            {t('groupProfile.botCount', { count: channel.members.length })}
          </span>
        </div>
      </div>
      {members.length === 0 ? null : (
        <section className="bh-group-live-activity">
          <span {...hooked('bh-profile-card-label', profileStyles.cardLabel)}>
            {t('groupProfile.liveActivity')}
          </span>
          <div className="bh-group-live-activity-chips">
            {preview.map((item) => (
              <Tooltip
                key={item.personaBotId}
                label={
                  item.name +
                  ' · ' +
                  personaBotPresentationSummary(
                    item.state ?? 'idle',
                    item.activity,
                    item.attention,
                    t,
                  )
                }
                side="bottom"
                portal
              >
                <span
                  className="bh-group-activity-chip"
                  tabIndex={0}
                  data-bot-id={item.personaBotId}
                >
                  <PillButton as="span" className="bh-group-activity-pill">
                    <PersonaBotAvatar {...item} size={18} indicator={false} t={t} />
                    <span className="bh-group-activity-chip-name">{item.name}</span>
                    <span className="bh-group-activity-chip-state">
                      {personaBotActivityLabel(item.state ?? 'idle', t)}
                    </span>
                  </PillButton>
                </span>
              </Tooltip>
            ))}
            {remaining > 0 ? (
              <PillButton as="span" className="bh-group-activity-overflow">
                <span aria-label={t('main.activity.more', { count: remaining })}>+{remaining}</span>
              </PillButton>
            ) : null}
          </div>
        </section>
      )}
      <ProfileActivitySection title={t('profile.activitySection')}>
        {cards.listGroup().map((card) => (
          <ProfileCard key={card.id} label={card.label}>
            {card.render({ channel, activity, botNames, t, compact: false })}
          </ProfileCard>
        ))}
      </ProfileActivitySection>
    </ProfilePanel>
  );
}
