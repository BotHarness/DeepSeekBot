import { Icon } from '../../ds/icon.js';
import { QuoteIcon } from '../../quote-icon.js';
import { humanIdOf, useSelfHumanId } from '../../self-human.js';
import { PendingDelivery } from '../../message-delivery.js';
import { BubbleToolbar } from '../../bubble-toolbar.js';
import { memo, useContext, useMemo, type CSSProperties, type ReactElement } from 'react';
import { Tooltip } from '../../ds/tooltip.js';
import type { BridgeActions } from '../../actions.js';
import { PersonaBotAvatar } from '../../avatar.js';
import { ChannelMessageBody, type NativeChatFailureText } from '../../channel-message-body.js';
import { BridgeSourceAuthor } from '../../bridge-source-author.js';
import {
  botNameColor,
  botNameSource,
  humanBubbleColors,
  useConversationSurface,
} from '../../bot-primary-color.js';
import { ChannelDeliveryReceipt } from '../../channel-delivery-receipt.js';
import { BubbleBadges } from '../../bubble-badges.js';
import { MessageCopyAction } from '../../message-copy-action.js';
import { MessageAuthorHoverCard, messageAuthorCardModel } from '../../message-author-card.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { MessageGroup } from '../../message-groups.js';
import {
  type BotSummary,
  type ChannelHumanMember,
  type ChannelMessage,
  type ChannelReaction,
  type ChannelSummary,
} from '../../store.js';
import { useAvatarFollow } from '../../avatar-follow.js';
import { IconButton } from '../../ds/icon-button.js';
import { hooked } from '../../ds/hooked.js';
import { bubble } from '../../ds/chat-chrome.js';
import { foldableMessage, MessageFold } from '../../message-fold.js';
import { MessageReactionPicker } from '../../message-reactions.js';
import { reactableMessage } from '../../message-reactions-model.js';
import { ImageGalleryScope, type Gallery } from '../../message-image-gallery.js';
import { MessageAvatarsContext } from '../../message-avatars.js';
import { HumanAvatarImage } from '../../human-avatar.js';
import { bubbleMedia } from '../../message-album.js';
import { MessageBubbleWrap } from './message-bubble-wrap.js';
import { QuoteList } from './message-quote-list.js';
import { authorLabel, bubbleStamp, fullTime, quotableMessage } from './message-labels.js';

function humanBubbleStyle(
  source: string | undefined,
  background: string,
): CSSProperties | undefined {
  if (source === undefined) return undefined;
  const light = humanBubbleColors(source, 'light', background);
  const dark = humanBubbleColors(source, 'dark', background);
  if (light === undefined || dark === undefined) return undefined;
  return {
    '--bh-bubble-me-fill-light': light.fill,
    '--bh-bubble-me-ink-light': light.ink,
    '--bh-bubble-me-fill-dark': dark.fill,
    '--bh-bubble-me-ink-dark': dark.ink,
  } as CSSProperties;
}

export interface InboxTarget {
  botSlug: string;
  messageId: string;
  missing: boolean;
}

const NO_REACTIONS: readonly ChannelReaction[] = [];
const NO_READERS: readonly string[] = [];

export const MessageGroupView = memo(function MessageGroupView({
  humanMembers = [],
  group,
  arrivals,
  channelId,
  channelType,
  bots,
  focusMessageId,
  currentDmBotSlug,
  remoteBot,
  remoteContact,
  remoteAvailability,
  onContextMenu,
  onAvatarMenu,
  renderAvatarButton,
  renderFailedButton,
  onOpenInbox,
  onReply,
  onReact,
  onJumpReply,
  onRestoreFailed,
  reading,
  actions,
  resolvedGrantRequests,
  toolApprovalDecisions,
  userQuestionResolutions,
  gallery,
  nativeChatT,
  t,
}: {
  humanMembers?: readonly ChannelHumanMember[];
  gallery?: Gallery | undefined;
  group: MessageGroup;
  arrivals?: ReadonlySet<string> | undefined;
  channelId?: string | undefined;
  channelType?: ChannelSummary['type'] | undefined;
  focusMessageId?: string | undefined;
  currentDmBotSlug?: string | undefined;
  remoteBot?: ChannelSummary['remoteBot'] | undefined;
  remoteContact?: ChannelSummary['remoteContact'] | undefined;
  remoteAvailability?: ChannelSummary['remoteAvailability'];
  bots: readonly BotSummary[];
  onContextMenu(message: ChannelMessage, x: number, y: number): void;
  onAvatarMenu?: ((botSlug: string, x: number, y: number) => void) | undefined;
  renderAvatarButton(props: {
    botSlug: string;
    displayBot: BotSummary | undefined;
    avatar: ReactElement;
    onAvatarMenu: ((botSlug: string, x: number, y: number) => void) | undefined;
    actions: BridgeActions;
    t: BotHarnessTranslate;
  }): ReactElement;
  renderFailedButton(props: {
    message: ChannelMessage;
    onRestoreFailed(message: ChannelMessage): void;
    t: BotHarnessTranslate;
  }): ReactElement;
  onOpenInbox?: ((target: InboxTarget) => void) | undefined;
  onReply?: ((message: ChannelMessage) => void) | undefined;
  onReact?: ((message: ChannelMessage, emoji: string, active: boolean) => void) | undefined;
  onRestoreFailed?: ((message: ChannelMessage) => void) | undefined;
  onJumpReply(messageId: string): void;
  reading?: ReadonlyMap<string, readonly string[]> | undefined;
  actions: BridgeActions;
  resolvedGrantRequests: ReadonlySet<string>;
  toolApprovalDecisions: ReadonlyMap<
    string,
    | 'allowed-once'
    | 'allowed-always-tool'
    | 'allowed-always-exact'
    | 'allowed-always-all'
    | 'rejected'
  >;
  userQuestionResolutions: ReadonlyMap<string, 'answered' | 'cancelled'>;
  t: BotHarnessTranslate;
  nativeChatT?: NativeChatFailureText | undefined;
}): ReactElement {
  const humans = useMemo(() => ({ humanMembers: [...humanMembers] }), [humanMembers]);
  const first = group.messages[0]!;
  const author = first.author;
  const self = useSelfHumanId();
  const human = author.kind === 'human' && humanIdOf(author) === self;
  const otherHuman = author.kind === 'human' && !human;
  const authorHumanId = author.kind === 'human' ? (humanIdOf(author) ?? self) : self;
  const authorAvatarVersion = humanMembers.find(
    (member) => member.humanId === authorHumanId,
  )?.avatarVersion;
  const authorBot =
    author.kind === 'bot' ? bots.find((candidate) => candidate.slug === author.slug) : undefined;
  const welcomeBot =
    first.onboardingWelcome === undefined || currentDmBotSlug === undefined
      ? undefined
      : bots.find((candidate) => candidate.slug === currentDmBotSlug);
  const displayBot = authorBot ?? welcomeBot;
  const reactorName = (actor: { kind: 'human' | 'bot'; id: string }): string =>
    actor.kind === 'human'
      ? actor.id === self
        ? t('message.reaction.you')
        : (humanMembers.find((member) => member.humanId === actor.id)?.displayName ?? actor.id)
      : (bots.find((candidate) => candidate.slug === actor.id)?.displayName ?? actor.id);
  const surface = useConversationSurface();
  const nameSource = first.bridgeOrigin ? undefined : botNameSource(displayBot);
  const nameColor =
    nameSource === undefined ? undefined : botNameColor(nameSource, surface.background);
  const dm = currentDmBotSlug !== undefined;
  const avatars = useContext(MessageAvatarsContext);
  const foreignBot =
    author.kind === 'bot' && displayBot === undefined && !dm
      ? { slug: author.slug, name: author.displayName ?? t('team.someBot') }
      : undefined;
  const avatar =
    (dm && !avatars.dm) || displayBot === undefined ? undefined : (
      <PersonaBotAvatar
        t={t}
        personaBotId={displayBot.slug}
        name={displayBot.displayName}
        src={displayBot.avatar}
        appearance={displayBot.appearance}
        avatarSeed={displayBot.avatarSeed}
        size={28}
        indicator={false}
        nativeTitle={false}
      />
    );
  const authorName = welcomeBot?.displayName ?? authorLabel(first, bots, t, humans, remoteBot);
  const authorCard =
    author.kind === 'remote-bot' &&
    remoteBot?.hostId === author.hostId &&
    remoteBot.botSlug === author.slug
      ? {
          kind: 'remote-bot' as const,
          peer: remoteBot,
          contact: remoteContact,
          availability: remoteAvailability,
        }
      : first.bridgeOrigin !== undefined
        ? undefined
        : displayBot !== undefined
          ? messageAuthorCardModel({ kind: 'bot', bot: displayBot }, currentDmBotSlug, t)
          : human || otherHuman
            ? messageAuthorCardModel({ kind: 'human', name: authorName }, currentDmBotSlug, t)
            : undefined;
  const withAuthorCard = (anchor: ReactElement): ReactElement =>
    authorCard === undefined ? (
      anchor
    ) : (
      <MessageAuthorHoverCard
        anchor={anchor}
        model={authorCard}
        bot={displayBot}
        onMessage={
          displayBot === undefined ? undefined : () => void actions.openBot(displayBot.slug)
        }
        onProfile={
          displayBot === undefined
            ? undefined
            : () => void actions.openBot(displayBot.slug, 'profile')
        }
        t={t}
      />
    );
  const dmBot =
    human && currentDmBotSlug !== undefined
      ? bots.find((candidate) => candidate.slug === currentDmBotSlug)
      : undefined;
  const bubbleStyle = humanBubbleStyle(botNameSource(dmBot), surface.background);
  const lastId = group.messages[group.messages.length - 1]!.id;
  const arriving = arrivals?.has(lastId) === true;
  const follow = useAvatarFollow(lastId, arriving);
  return (
    <div
      className={`bh-message-group${human ? ' bh-message-group-me' : ''}${arriving && group.messages.length === 1 ? ' bh-message-group-enter' : ''}`}
      data-group-size={group.messages.length}
      style={bubbleStyle}
      ref={surface.probe}
    >
      {foreignBot === undefined ? null : (
        <span className="bh-message-group-avatar" aria-hidden="true">
          <PersonaBotAvatar
            t={t}
            personaBotId={foreignBot.slug}
            name={foreignBot.name}
            size={28}
            indicator={false}
            nativeTitle={false}
          />
        </span>
      )}
      {otherHuman && channelType === 'group' ? (
        <span ref={follow} className="bh-message-group-avatar">
          {withAuthorCard(
            <span className="bh-message-group-human-avatar" aria-label={authorName}>
              <HumanAvatarImage
                cache={actions.humanAvatars}
                humanId={authorHumanId}
                version={authorAvatarVersion}
              />
            </span>,
          )}
        </span>
      ) : avatar === undefined || author.kind !== 'bot' ? null : (
        <span ref={follow} className="bh-message-group-avatar">
          {withAuthorCard(
            renderAvatarButton({
              botSlug: author.slug,
              displayBot,
              avatar,
              onAvatarMenu,
              actions,
              t,
            }),
          )}
        </span>
      )}
      <div className="bh-message-stack">
        {dm || human ? null : (
          <div className="bh-message-identity">
            {first.bridgeOrigin ? (
              <BridgeSourceAuthor origin={first.bridgeOrigin} t={t} />
            ) : (
              withAuthorCard(
                <span
                  className="bh-bubble-author"
                  {...(author.kind === 'remote-bot'
                    ? {
                        role: 'group',
                        tabIndex: 0,
                        'aria-label': t('message.authorCard.label', {
                          name: authorName,
                        }),
                      }
                    : {})}
                  data-bot-name-color={nameColor}
                  style={nameColor === undefined ? undefined : { color: nameColor }}
                >
                  {authorName}
                </span>,
              )
            )}
          </div>
        )}
        {group.messages.map((message, index) => {
          const position =
            group.messages.length === 1
              ? 'solo'
              : index === 0
                ? 'first'
                : index === group.messages.length - 1
                  ? 'last'
                  : 'middle';
          const stamp = bubbleStamp(message);
          return (
            <MessageBubbleWrap
              key={message.id}
              message={message}
              entering={arrivals?.has(message.id) === true}
              focused={focusMessageId === message.id}
              onContextMenu={onContextMenu}
            >
              <div
                className={`bh-bubble-surface${message.failed === undefined ? '' : ' bh-bubble-surface-failed'}`}
              >
                {human && message.pending === true && message.failed === undefined ? (
                  <PendingDelivery message={message} t={t} />
                ) : null}
                {message.failed === undefined ? null : onRestoreFailed === undefined ? (
                  <span
                    className="bh-bubble-failed-action"
                    role="img"
                    aria-label={t(
                      message.unconfirmed === true ? 'message.unconfirmed' : 'message.failed',
                    )}
                    title={message.failed}
                  >
                    <Icon name="triangle-alert" size={16} />
                  </span>
                ) : (
                  renderFailedButton({ message, onRestoreFailed, t })
                )}
                <div
                  {...hooked(
                    `bh-bubble${human ? ' bh-bubble-me' : ''}${message.pending === true || message.streaming === true ? ' bh-bubble-pending' : ''}${message.failed === undefined ? '' : ' bh-bubble-failed'}`,
                    bubble.surface,
                    human && bubble.human,
                  )}
                  data-group-position={position}
                  data-bubble-media={bubbleMedia(message)}
                >
                  <QuoteList
                    humans={humans}
                    message={message}
                    channelId={channelId}
                    bots={bots}
                    onJump={onJumpReply}
                    t={t}
                  />
                  <ImageGalleryScope value={gallery}>
                    <MessageFold messageId={message.id} enabled={foldableMessage(message)} t={t}>
                      <ChannelMessageBody
                        message={message}
                        channelId={channelId}
                        t={t}
                        nativeChatT={nativeChatT}
                        actions={actions}
                        bots={bots}
                        humanMembers={humanMembers}
                        grantRequestResolved={resolvedGrantRequests.has(message.id)}
                        toolApprovalDecision={toolApprovalDecisions.get(message.id)}
                        userQuestionResolution={userQuestionResolutions.get(message.id)}
                      />
                    </MessageFold>
                  </ImageGalleryScope>
                  {message.streaming === true ? (
                    <span className="bh-bubble-status" role="status">
                      {t(message.streaming === true ? 'message.generating' : 'message.sending')}
                    </span>
                  ) : null}
                </div>
                <BubbleBadges
                  reactions={message.reactions ?? NO_REACTIONS}
                  readers={reading?.get(message.id) ?? NO_READERS}
                  mine={human}
                  names={reactorName}
                  onReact={
                    onReact === undefined || !reactableMessage(message)
                      ? undefined
                      : (emoji, active) => onReact(message, emoji, active)
                  }
                  bots={bots}
                  t={t}
                />
                <BubbleToolbar>
                  <div {...hooked('bh-bubble-actions', bubble.toolbar)}>
                    {stamp === undefined ? null : (
                      <time
                        {...hooked('bh-bubble-toolbar-time', bubble.time)}
                        data-bubble-time=""
                        dateTime={message.at}
                        title={fullTime(message.at, t)}
                      >
                        {stamp}
                      </time>
                    )}
                    {onReact !== undefined && reactableMessage(message) ? (
                      <MessageReactionPicker
                        message={message}
                        onReact={(emoji, active) => onReact(message, emoji, active)}
                        t={t}
                      />
                    ) : null}
                    {onReply !== undefined && quotableMessage(message) ? (
                      <Tooltip label={t('message.quote')} side="top" portal delayMs={400}>
                        <IconButton
                          size="inline"
                          data-bubble-action=""
                          aria-label={t('message.quote')}
                          onClick={() => onReply(message)}
                        >
                          <QuoteIcon />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                    <MessageCopyAction body={message.body} t={t} />
                  </div>
                </BubbleToolbar>
              </div>
              <div className="bh-bubble-side">
                <ChannelDeliveryReceipt
                  message={message}
                  bots={bots}
                  humanMembers={humanMembers}
                  onOpenInbox={
                    onOpenInbox === undefined
                      ? undefined
                      : (target) => onOpenInbox({ ...target, messageId: message.id })
                  }
                  t={t}
                />
              </div>
            </MessageBubbleWrap>
          );
        })}
      </div>
      {human && avatars.own ? (
        <span ref={follow} className="bh-message-group-avatar">
          <span className="bh-message-group-human-avatar" aria-label={authorName}>
            <HumanAvatarImage
              cache={actions.humanAvatars}
              humanId={authorHumanId}
              version={authorAvatarVersion}
            />
          </span>
        </span>
      ) : null}
    </div>
  );
});
