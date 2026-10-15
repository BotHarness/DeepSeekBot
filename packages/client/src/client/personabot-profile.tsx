import { useState, type ReactElement } from 'react';

import {
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { bannerOf, BotBannerArt } from './bot-banner.js';
import type { BridgeActions } from './actions.js';
import type { ProfileActivity } from './bridge.js';
import { PersonaBotDeletionView } from './personabot-deletion.js';
import { PersonaBotAvatar } from './avatar.js';
import { ProfileBio, ProfileHeader } from './profile-header.js';
import { ProfileTags } from './profile-tags.js';
import type { BotHarnessTranslate } from './locale.js';
import type {
  ProfileCardDescriptor,
  ProfileCardProps,
  ProfileCardRegistry,
} from './profile-cards.js';
import { MessagingHelp } from './messaging-help.js';
import type { BotSummary, ChannelSummary } from './store.js';

export interface ProfilePopoverProps {
  bot: BotSummary;
  activity: ProfileActivity | undefined;
  cards: ProfileCardRegistry;
  pinned: readonly string[];
  t: BotHarnessTranslate;
  onExpand(): void;
}

function ProfileCardLabel({
  card,
  ...props
}: ProfileCardProps & { card: ProfileCardDescriptor }): ReactElement {
  const help = card.help?.(props);
  return (
    <span className="bh-profile-card-label">
      {card.label}
      {help ? <MessagingHelp title={card.label} text={help} t={props.t} /> : null}
    </span>
  );
}

export function ProfilePopover({
  bot,
  activity,
  cards,
  pinned,
  t,
  onExpand,
}: ProfilePopoverProps): ReactElement {
  const pinnedCards = cards
    .list()
    .filter((card) => pinned.includes(card.id) && (card.visible?.(bot) ?? true));
  return (
    <div className="bh-profile-popover" role="dialog" aria-label={t('profile.label')}>
      <div className="bh-profile-popover-banner">
        <BotBannerArt banner={bannerOf(bot.banner, bot.displayName)} />
      </div>
      <div className="bh-profile-popover-identity">
        <PersonaBotAvatar
          t={t}
          personaBotId={bot.slug}
          name={bot.displayName}
          src={bot.avatar}
          appearance={bot.appearance}
          avatarSeed={bot.avatarSeed}
          size={40}
          indicator={false}
        />
        <span className="bh-profile-popover-text">
          <span className="bh-profile-name">{bot.displayName}</span>
          <ProfileTags tags={bot.roles} />
        </span>
      </div>
      <ProfileBio text={bot.description} />
      {pinnedCards.length === 0 ? null : (
        <div className="bh-profile-popover-cards">
          {pinnedCards.map((card) => (
            <section key={card.id} className="bh-profile-card bh-profile-card-compact">
              <ProfileCardLabel card={card} bot={bot} activity={activity} t={t} />
              {card.render({ bot, activity, t, compact: true })}
            </section>
          ))}
        </div>
      )}
      <button type="button" className="bh-profile-expand" onClick={onExpand}>
        <span>{t('profile.open')}</span>
        <IconChevronRightOutlineRegular />
      </button>
    </div>
  );
}

export interface ProfileViewProps {
  bot: BotSummary;
  channel: ChannelSummary;
  activity: ProfileActivity | undefined;
  cards: ProfileCardRegistry;
  pinned: readonly string[];
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onTogglePin(id: string): void;
  onClose(): void;
}

export function ProfileView({
  bot,
  channel,
  activity,
  cards,
  pinned,
  actions,
  t,
  onTogglePin,
  onClose,
}: ProfileViewProps): ReactElement {
  const [deleting, setDeleting] = useState(false);
  const visibleCards = cards.list().filter((card) => card.visible?.(bot) ?? true);
  return (
    <div className="bh-profile-view">
      <button type="button" className="bh-profile-back" onClick={onClose}>
        <IconChevronLeftOutlineRegular />
        <span>{t('profile.close')}</span>
      </button>
      <ProfileHeader
        key={bot.slug}
        bot={bot}
        channel={channel}
        actions={actions}
        t={t}
        onDelete={() => setDeleting(true)}
      />
      {deleting && !bot.deleted ? (
        <PersonaBotDeletionView
          key={bot.slug}
          slug={bot.slug}
          actions={actions}
          t={t}
          onClose={() => setDeleting(false)}
        />
      ) : null}
      {visibleCards.length === 0 ? null : (
        <section className="bh-profile-section" aria-label={t('profile.activitySection')}>
          <h2 className="bh-profile-section-title">{t('profile.activitySection')}</h2>
          <div className="bh-profile-cards">
            {visibleCards.map((card) => {
              const isPinned = pinned.includes(card.id);
              return (
                <section key={card.id} className="bh-profile-card">
                  <header className="bh-profile-card-head">
                    <ProfileCardLabel card={card} bot={bot} activity={activity} t={t} />
                    <button
                      type="button"
                      className="bh-profile-pin"
                      aria-pressed={isPinned}
                      aria-label={isPinned ? t('profile.unpin') : t('profile.pin')}
                      onClick={() => onTogglePin(card.id)}
                    >
                      {isPinned ? <IconPinFillRegular /> : <IconPinOutlineRegular />}
                    </button>
                  </header>
                  {card.render({
                    bot,
                    activity,
                    t,
                    compact: false,
                    loadUsage: (filter) => actions.profileUsage(channel.id, filter),
                    loadActivity: (window) => actions.profileActivity(channel.id, window),
                  })}
                </section>
              );
            })}
          </div>
        </section>
      )}
      {bot.deleted ? (
        <PersonaBotDeletionView
          key={`deleted-${bot.slug}`}
          slug={bot.slug}
          actions={actions}
          t={t}
          onClose={onClose}
          history
        />
      ) : null}
    </div>
  );
}
