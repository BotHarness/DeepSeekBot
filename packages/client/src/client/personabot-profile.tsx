import { ProfileActivitySection, ProfileCard, ProfilePanel } from './ds/profile-panel.js';
import { useMemo, useState, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import type { ProfileActivity } from './bridge.js';
import type { BotSkillsSource } from './bot-skills-card.js';
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
    <>
      {card.label}
      {help ? <MessagingHelp title={card.label} text={help} t={props.t} /> : null}
    </>
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
  const visibleCards =
    bot.sharedBy === undefined ? cards.list().filter((card) => card.visible?.(bot) ?? true) : [];
  const { botSkills, skillDetail, botSkillRemove, subscribeSkillCatalog } = actions;
  const skills = useMemo<BotSkillsSource | undefined>(
    () =>
      botSkills === undefined || skillDetail === undefined || botSkillRemove === undefined
        ? undefined
        : {
            list: () => botSkills(bot.slug),
            read: (name) => skillDetail(name, `bot:${bot.slug}`),
            remove: (name) => botSkillRemove(bot.slug, name),
            ...(subscribeSkillCatalog === undefined
              ? {}
              : { subscribe: (listener) => subscribeSkillCatalog(channel.id, listener) }),
          },
    [botSkills, skillDetail, botSkillRemove, subscribeSkillCatalog, bot.slug, channel.id],
  );
  return (
    <ProfilePanel backLabel={t('profile.close')} onClose={onClose}>
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
        <ProfileActivitySection title={t('profile.activitySection')}>
          {visibleCards.map((card) => (
            <ProfileCard
              key={card.id}
              label={<ProfileCardLabel card={card} bot={bot} activity={activity} t={t} />}
            >
              {card.render({
                bot,
                activity,
                t,
                compact: false,
                loadUsage: (filter) => actions.profileUsage(channel.id, filter),
                loadActivity: (window) => actions.profileActivity(channel.id, window),
                ...(skills === undefined ? {} : { skills }),
              })}
            </ProfileCard>
          ))}
        </ProfileActivitySection>
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
    </ProfilePanel>
  );
}
