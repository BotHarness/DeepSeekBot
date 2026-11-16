import { useContext, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';

import { botNameColor } from '../../../../../packages/client/src/client/bot-name-color';
import type { ConversationMessage } from '../../host/conversation';
import type { WireMention, WireSkillInvocation } from '../../host/wire';
import { BotAvatar } from '../bot-avatar';
import { botColor } from '../bot-color';
import { useDesignTheme } from '../design/theme';
import { renderMarkdownInline } from '../markdown-inline';
import { MarkdownView } from '../markdown-view';
import { InlineText, Text } from '../primitives/text';
import { useStrings } from '../strings';
import { MessageIdentities } from './message-identities';
import {
  leadingMessageMentions,
  messageMentionRuns,
  mentionIdentity,
  mentionMarkdownBody,
} from './message-mentions';
import { messageSkillRuns } from './skill-draft';
import { SkillOwnerMark, skillOwnerName } from './skill-suggestions';

function Skill({ skill, color }: { skill: WireSkillInvocation; color: string }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const { bots } = useContext(MessageIdentities);
  const owner = skill.owner;
  const bot =
    owner.kind === 'bot' ? bots.find((candidate) => candidate.slug === owner.botSlug) : undefined;
  const option = {
    name: skill.name,
    description: '',
    owner,
    ...(bot === undefined ? {} : { bot }),
  };
  const name = skillOwnerName(option, t.skillOwnerHost);
  const size = theme.type.body.size * theme.fontScale;
  const offset = ((theme.type.body.line - theme.type.body.size) * theme.fontScale) / 2;
  return (
    <InlineText
      accessibilityLabel={t.skillChip(skill.name, name)}
      style={{ color, fontWeight: theme.weight.strong }}
    >
      <View style={{ width: size, height: size, transform: [{ translateY: offset }] }}>
        <SkillOwnerMark option={option} size={size} />
      </View>
      {'\u00a0'}/{skill.name}
    </InlineText>
  );
}

type BodyToken =
  | { start: number; end: number; mention: WireMention }
  | { start: number; end: number; skill: WireSkillInvocation };

function humanRuns(message: ConversationMessage) {
  const tokens: BodyToken[] = [
    ...messageMentionRuns(message.body, message.mentions).flatMap((run) =>
      run.mention === undefined
        ? []
        : [{ start: run.mention.start, end: run.mention.end, mention: run.mention }],
    ),
    ...(message.skillInvocations ?? []).map((skill) => ({
      start: skill.start,
      end: skill.end,
      skill,
    })),
  ];
  return messageSkillRuns(message.body, tokens);
}

function Mention({ mention, background }: { mention: WireMention; background: string }) {
  const t = useStrings();
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
  trail,
}: {
  message: ConversationMessage;
  streaming: boolean;
  trail?: ReactNode;
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
      <Text testID="message-text" tone={ink}>
        {humanRuns(message).map((run, index) =>
          run.token === undefined ? (
            run.text
          ) : 'mention' in run.token ? (
            <Mention key={index} mention={run.token.mention} background={background} />
          ) : (
            <Skill key={index} skill={run.token.skill} color={theme.color[ink]} />
          ),
        )}
        {trail}
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
