import { useContext, useMemo } from 'react';
import { View } from 'react-native';

import { botNameColor } from '../../../../../packages/client/src/client/bot-name-color';
import type { ConversationMessage } from '../../host/conversation';
import type { WireMention } from '../../host/wire';
import { BotAvatar } from '../bot-avatar';
import { botColor } from '../bot-color';
import { useDesignTheme } from '../design/theme';
import { renderMarkdownInline } from '../markdown-inline';
import { MarkdownView } from '../markdown-view';
import { InlineText, Text } from '../primitives/text';
import { t } from '../strings';
import { MessageIdentities } from './message-identities';
import {
  leadingMessageMentions,
  messageMentionRuns,
  mentionIdentity,
  mentionMarkdownBody,
} from './message-mentions';

function Mention({ mention, background }: { mention: WireMention; background: string }) {
  const theme = useDesignTheme();
  const { bots, openBot } = useContext(MessageIdentities);
  const { label, bot } = mentionIdentity(mention, bots);
  const enabled = bot !== undefined && openBot !== undefined;
  const size = theme.type.body.size * theme.fontScale;
  const offset = ((theme.type.body.line - theme.type.body.size) * theme.fontScale) / 2;
  return (
    <InlineText
      {...(enabled
        ? {
            accessibilityRole: 'link' as const,
            accessibilityLabel: t.openMention(label),
            onPress: () => openBot(bot.slug),
          }
        : {})}
      style={{
        color: botNameColor(bot === undefined ? theme.color.fg : botColor(bot), background),
        fontWeight: theme.weight.strong,
      }}
    >
      {bot === undefined ? null : (
        <View style={{ width: size, height: size, transform: [{ translateY: offset }] }}>
          <BotAvatar bot={bot} size={size} ring={false} />
        </View>
      )}
      {'\u00a0'}@{label}
      {'\u00a0'}
    </InlineText>
  );
}

export function MessageBody({
  message,
  streaming,
}: {
  message: ConversationMessage;
  streaming: boolean;
}) {
  const theme = useDesignTheme();
  const human = message.author === 'human';
  const ink = human ? 'onAccent' : 'fg';
  const background = human ? theme.color.accent : theme.color.surface;
  const leading = leadingMessageMentions(message.body, message.mentions);
  const text = leading?.text ?? message.body;
  const markdown = useMemo(() => {
    if (human || leading === undefined) return undefined;
    return mentionMarkdownBody(text, streaming);
  }, [human, leading === undefined, text, streaming]);
  if (human)
    return (
      <Text tone={ink}>
        {messageMentionRuns(message.body, message.mentions).map((run, index) =>
          run.mention === undefined ? (
            run.text
          ) : (
            <Mention key={index} mention={run.mention} background={background} />
          ),
        )}
      </Text>
    );
  if (leading === undefined)
    return text.trim() === '' ? (
      streaming ? (
        <Text tone="muted">…</Text>
      ) : null
    ) : (
      <MarkdownView
        source={text}
        color={theme.color[ink]}
        selectable={false}
        streaming={streaming}
      />
    );
  return (
    <>
      <Text tone={ink}>
        {leading.mentions.map((mention) => (
          <Mention key={mention.start} mention={mention} background={background} />
        ))}
        {markdown === undefined
          ? null
          : renderMarkdownInline(markdown.first.tokens ?? [], theme, false, theme.color[ink])}
      </Text>
      {(markdown?.rest ?? (markdown === undefined ? text : '')).trim() === '' ? null : (
        <MarkdownView
          source={markdown?.rest ?? text}
          color={theme.color[ink]}
          selectable={false}
          streaming={streaming}
        />
      )}
    </>
  );
}
