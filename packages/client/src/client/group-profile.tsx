import {
  PersonaBotAvatar,
  personaBotActivityLabel,
  personaBotActivityPreview,
  personaBotPresentationSummary,
  type PersonaBotFacepileItem,
} from './avatar.js';
import { bridgeSourceLabel } from './bridge-source-label.js';
import type { ReactElement } from 'react';

import { Pill, IconChevronLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
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
    <div className="bh-profile-view">
      <button type="button" className="bh-profile-back" onClick={onClose}>
        <IconChevronLeftOutlineRegular />
        <span>{t('profile.close')}</span>
      </button>
      <div className="bh-profile-view-identity">
        <GroupAvatar channel={channel} size="large" />
        <div className="bh-profile-view-heading">
          <h2 className="bh-profile-view-name">{channel.name}</h2>
          <span className="bh-profile-description">
            {t('groupProfile.botCount', { count: channel.members.length })}
          </span>
        </div>
      </div>
      {members.length === 0 ? null : (
        <section className="bh-group-live-activity">
          <span className="bh-profile-card-label">{t('groupProfile.liveActivity')}</span>
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
                  <Pill className="bh-group-activity-pill">
                    <PersonaBotAvatar {...item} size={18} indicator={false} t={t} />
                    <span className="bh-group-activity-chip-name">{item.name}</span>
                    <span className="bh-group-activity-chip-state">
                      {personaBotActivityLabel(item.state ?? 'idle', t)}
                    </span>
                  </Pill>
                </span>
              </Tooltip>
            ))}
            {remaining > 0 ? (
              <Pill className="bh-group-activity-overflow">
                <span aria-label={t('main.activity.more', { count: remaining })}>+{remaining}</span>
              </Pill>
            ) : null}
          </div>
        </section>
      )}
      <section className="bh-profile-section" aria-label={t('profile.activitySection')}>
        <h2 className="bh-profile-section-title">{t('profile.activitySection')}</h2>
        <div className="bh-profile-cards">
          {cards.listGroup().map((card) => {
            return (
              <section key={card.id} className="bh-profile-card">
                <header className="bh-profile-card-head">
                  <span className="bh-profile-card-label">{card.label}</span>
                </header>
                {card.render({ channel, activity, botNames, t, compact: false })}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
