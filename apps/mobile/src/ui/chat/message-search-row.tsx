import { View } from 'react-native';

import type { MessageSearchHit } from '../../host/message-search';
import type { HostLook } from '../design/host-look';
import { chatList, space } from '../design/tokens';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import {
  ConversationBotAvatar,
  ConversationGroupAvatar,
  ConversationRowFrame,
} from './conversation-row';
import { shortTime, titleOf, type Conversation } from './conversations';

export function MessageSearchHeading({ loading }: { loading: boolean }) {
  const t = useStrings();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        paddingHorizontal: chatList.gutter,
        paddingTop: space.x5,
        paddingBottom: space.x2,
      }}
    >
      <Text variant="meta" tone="subtle" strong accessibilityRole="header">
        {t.searchMessages}
      </Text>
      {loading ? (
        <LoadingIndicator size="control" accessibilityLabel={t.searchMessagesLoading} />
      ) : null}
    </View>
  );
}

export function MessageSearchRow({
  hit,
  conversation,
  look,
  sourceLabel,
  now,
  onPress,
}: {
  hit: MessageSearchHit;
  conversation: Conversation;
  look?: HostLook | undefined;
  sourceLabel?: string | undefined;
  now: Date;
  onPress(): void;
}) {
  const t = useStrings();
  const title = titleOf(conversation);
  const author =
    hit.author.kind === 'human'
      ? t.searchMessageAuthorYou
      : hit.author.kind === 'bot'
        ? ((conversation.kind === 'bot' && conversation.bot.slug === hit.author.slug
            ? conversation.bot.displayName
            : undefined) ?? hit.author.slug)
        : hit.author.kind === 'bridged'
          ? hit.author.source
          : title;
  const time = shortTime(hit.at, now);
  const preview = `${author}: ${hit.snippet}`;
  return (
    <ConversationRowFrame
      testID={`message-search-row-${hit.messageId}`}
      title={title}
      source="computer"
      look={look}
      sourceLabel={sourceLabel}
      label={t.searchMessageLabel(title, author, hit.snippet, time)}
      preview={preview}
      time={time}
      onPress={onPress}
      avatar={
        conversation.kind === 'bot' ? (
          <ConversationBotAvatar bot={conversation.bot} />
        ) : (
          <ConversationGroupAvatar avatar={conversation.channel.avatar} />
        )
      }
    />
  );
}
