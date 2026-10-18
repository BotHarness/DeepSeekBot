import { useState, type ReactElement } from 'react';

import { IconChevronLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type { ProfileActivity } from './bridge.js';
import { PersonaBotDeletionView } from './personabot-deletion.js';
import { ProfileHeader } from './profile-header.js';
import type { BotHarnessTranslate } from './locale.js';
import type {
  ProfileCardDescriptor,
  ProfileCardProps,
  ProfileCardRegistry,
} from './profile-cards.js';
import { MessagingHelp } from './messaging-help.js';
import type { BotSummary, ChannelSummary } from './store.js';

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

export interface ProfileViewProps {
  bot: BotSummary;
  channel: ChannelSummary;
  activity: ProfileActivity | undefined;
  cards: ProfileCardRegistry;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose(): void;
}

export function ProfileView({
  bot,
  channel,
  activity,
  cards,
  actions,
  t,
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
              return (
                <section key={card.id} className="bh-profile-card">
                  <header className="bh-profile-card-head">
                    <ProfileCardLabel card={card} bot={bot} activity={activity} t={t} />
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
