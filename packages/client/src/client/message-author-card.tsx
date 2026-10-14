import type { ReactElement, ReactNode } from 'react';
import {
  HoverCard,
  IconNewChatOutlineRegular,
  IconUserOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

import {
  normalizePersonaBotActivity,
  PersonaBotAvatar,
  personaBotPresentationSummary,
  type PersonaBotActivityState,
} from './avatar.js';
import { ChipButton } from './ds/chip-button.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary } from './store.js';

export const MESSAGE_AUTHOR_CARD_DELAY_MS = 350;

export type MessageAuthorCardModel =
  | { kind: 'human'; name: string }
  | {
      kind: 'bot';
      slug: string;
      name: string;
      roles: string | undefined;
      description: string | undefined;
      state: PersonaBotActivityState;
      status: string;
      canMessage: boolean;
      canProfile: boolean;
    };

export function messageAuthorCardModel(
  author: { kind: 'human'; name: string } | { kind: 'bot'; bot: BotSummary },
  currentDmBotSlug: string | undefined,
  t: BotHarnessTranslate,
): MessageAuthorCardModel {
  if (author.kind === 'human') return { kind: 'human', name: author.name };
  const { bot } = author;
  const state = normalizePersonaBotActivity(bot.aggregateState);
  const roles = bot.roles.filter((role) => role.trim().length > 0);
  const description = bot.description?.trim();
  const available = bot.deleted !== true;
  return {
    kind: 'bot',
    slug: bot.slug,
    name: bot.displayName,
    roles: roles.length > 0 ? roles.join(' · ') : undefined,
    description: description === undefined || description.length === 0 ? undefined : description,
    state,
    status: personaBotPresentationSummary(state, bot.activity, bot.attention, t),
    canMessage: available && currentDmBotSlug !== bot.slug,
    canProfile: available,
  };
}

export function MessageAuthorCardContent({
  model,
  bot,
  onMessage,
  onProfile,
  t,
}: {
  model: MessageAuthorCardModel;
  bot?: BotSummary | undefined;
  onMessage?: (() => void) | undefined;
  onProfile?: (() => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  if (model.kind === 'human')
    return (
      <div className="bh-author-card" data-author-kind="human">
        <span className="bh-author-card-name">{model.name}</span>
      </div>
    );
  const showMessage = model.canMessage && onMessage !== undefined;
  const showProfile = model.canProfile && onProfile !== undefined;
  return (
    <div className="bh-author-card" data-author-kind="bot" data-state={model.state}>
      <div className="bh-author-card-head">
        {bot === undefined ? null : (
          <PersonaBotAvatar
            t={t}
            personaBotId={bot.slug}
            name={bot.displayName}
            src={bot.avatar}
            appearance={bot.appearance}
            avatarSeed={bot.avatarSeed}
            state={model.state}
            activity={bot.activity}
            attention={bot.attention}
            size={40}
            nativeTitle={false}
          />
        )}
        <span className="bh-author-card-identity">
          <span className="bh-author-card-name">{model.name}</span>
          {model.roles === undefined ? null : (
            <span className="bh-author-card-meta">{model.roles}</span>
          )}
        </span>
      </div>
      {model.description === undefined ? null : (
        <span className="bh-author-card-description">{model.description}</span>
      )}
      <span className="bh-author-card-status">
        <span className="bh-author-card-status-label">{t('message.authorCard.status')}</span>
        <span className="bh-author-card-status-value">{model.status}</span>
      </span>
      {showMessage || showProfile ? (
        <div className="bh-author-card-actions">
          {showMessage ? (
            <ChipButton
              icon={<IconNewChatOutlineRegular size={14} />}
              label={t('message.authorCard.message')}
              aria-label={t('message.mention.openDm', { bot: model.name })}
              onClick={onMessage}
            />
          ) : null}
          {showProfile ? (
            <ChipButton
              icon={<IconUserOutlineRegular size={14} />}
              label={t('message.authorCard.profile')}
              aria-label={t('message.authorCard.profileFor', { bot: model.name })}
              onClick={onProfile}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MessageAuthorHoverCard({
  anchor,
  model,
  bot,
  onMessage,
  onProfile,
  t,
}: {
  anchor: ReactNode;
  model: MessageAuthorCardModel;
  bot?: BotSummary | undefined;
  onMessage?: (() => void) | undefined;
  onProfile?: (() => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <HoverCard
      inline
      openDelayMs={MESSAGE_AUTHOR_CARD_DELAY_MS}
      anchor={anchor}
      content={
        <MessageAuthorCardContent
          model={model}
          bot={bot}
          onMessage={onMessage}
          onProfile={onProfile}
          t={t}
        />
      }
    />
  );
}
