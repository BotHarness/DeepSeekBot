import { Text } from '../../src/ui/primitives/system-text';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { fullClientParams, type FullClientTarget } from '../../src/host/full-client';
import { useHostSession, useHostSnapshot, useInbox } from '../../src/host/host-session';
import { messageHref } from '../../src/host/push';
import {
  answerQuestion,
  decideApproval,
  grantRequestPort,
  loadApproval,
  loadQuestion,
  type ApprovalChoice,
  type RequestRef,
} from '../../src/host/requests';
import { ApprovalView } from '../../src/ui/approval-view';
import { ATTENTION_KINDS, AttentionItemView } from '../../src/ui/attention-item';
import { GrantRequestCard } from '../../src/ui/chat/grant-request-card';
import { QuestionView } from '../../src/ui/question-view';
import { ActionButton, Notice } from '../../src/ui/request-parts';
import { t } from '../../src/ui/strings';
import { useTheme } from '../../src/ui/theme';

type Params = {
  id: string;
  kind: string;
  botSlug: string;
  summary?: string;
  channelId?: string;
  messageId?: string;
};

export default function InboxItemScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { saved, client, inbox } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const list = useInbox(inbox);
  const botName =
    snapshot.roster?.bots.find((bot) => bot.slug === params.botSlug)?.displayName ?? params.botSlug;
  const listed =
    list.status !== 'ready' || list.sections.action.some((item) => item.id === params.id);
  const ref = useMemo<RequestRef | undefined>(
    () =>
      params.channelId === undefined || params.messageId === undefined
        ? undefined
        : {
            channelId: params.channelId,
            messageId: params.messageId,
            botSlug: params.botSlug,
          },
    [params.channelId, params.messageId, params.botSlug],
  );
  const approvalPort = useMemo(
    () =>
      client === undefined || ref === undefined
        ? undefined
        : {
            load: () => loadApproval(client, ref),
            decide: async (outcome: ApprovalChoice) => {
              const result = await decideApproval(client, ref, outcome);
              void inbox?.refresh();
              return result;
            },
          },
    [client, inbox, ref],
  );
  const questionPort = useMemo(
    () =>
      client === undefined || ref === undefined
        ? undefined
        : {
            load: () => loadQuestion(client, ref),
            answer: async (answer: Parameters<typeof answerQuestion>[2]) => {
              const result = await answerQuestion(client, ref, answer);
              void inbox?.refresh();
              return result;
            },
          },
    [client, inbox, ref],
  );

  const grantPort = useMemo(
    () =>
      client === undefined || ref === undefined
        ? undefined
        : grantRequestPort(client, ref, () => void inbox?.refresh()),
    [client, inbox, ref],
  );

  const attention = useMemo(
    () => ({ id: params.id, botSlug: params.botSlug }),
    [params.id, params.botSlug],
  );
  const target: FullClientTarget =
    params.kind === 'private-input' && ref !== undefined
      ? {
          kind: 'private-input',
          channelId: ref.channelId,
          messageId: ref.messageId,
        }
      : { kind: 'home' };
  const title = t.kind[params.kind] ?? t.otherKind;
  const fallback = (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={{ color: theme.ink, fontSize: 20, fontWeight: '700' }}>{botName}</Text>
      {params.summary ? (
        <Text selectable style={{ color: theme.ink, fontSize: 16 }}>
          {params.summary}
        </Text>
      ) : null}
      <Notice tone="warning">
        {params.kind === 'private-input' ? t.privateInputHint : t.readOnlyHint}
      </Notice>
      {saved ? (
        <View style={{ flexDirection: 'row' }}>
          <ActionButton
            label={t.openFullClient}
            onPress={() =>
              router.push({
                pathname: '/full-client',
                params: fullClientParams(target),
              })
            }
          />
        </View>
      ) : null}
    </ScrollView>
  );
  let body;
  if (params.kind === 'tool-approval' && approvalPort !== undefined)
    body = <ApprovalView port={approvalPort} botName={botName} listed={listed} />;
  else if (params.kind === 'user-question' && questionPort !== undefined)
    body = <QuestionView port={questionPort} botName={botName} listed={listed} />;
  else if (params.kind === 'workspace-grant-request' && grantPort !== undefined)
    body = (
      <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
        <GrantRequestCard port={grantPort} botName={botName} wide />
      </ScrollView>
    );
  else if (ATTENTION_KINDS.has(params.kind) && client !== undefined)
    body = (
      <AttentionItemView
        client={client}
        target={attention}
        known={inbox?.find(params.id)}
        botName={botName}
        after={() => void inbox?.refresh()}
        onOpenChat={(item) => {
          const href = messageHref(
            item,
            (slug) => snapshot.roster?.bots.find((bot) => bot.slug === slug)?.dmChannelId,
            (channelId) =>
              snapshot.roster?.channels.some((channel) => channel.id === channelId) ?? false,
          );
          if (href !== undefined) router.push(href);
        }}
        fallback={fallback}
      />
    );
  else body = fallback;

  return (
    <>
      <Stack.Screen options={{ title }} />
      {body}
    </>
  );
}
