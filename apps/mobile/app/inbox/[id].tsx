import { Text } from '../../src/ui/primitives/system-text';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { fullClientParams, type FullClientTarget } from '../../src/host/full-client';
import { useHostSession, useHostSnapshot, useInbox } from '../../src/host/host-session';
import {
  answerQuestion,
  decideApproval,
  loadApproval,
  loadQuestion,
  type RequestRef,
} from '../../src/host/requests';
import { ApprovalView } from '../../src/ui/approval-view';
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
            decide: async (outcome: 'allowed-once' | 'rejected') => {
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

  const target: FullClientTarget =
    params.kind === 'private-input' && ref !== undefined
      ? {
          kind: 'private-input',
          channelId: ref.channelId,
          messageId: ref.messageId,
        }
      : { kind: 'home' };
  const title = t.kind[params.kind] ?? t.otherKind;
  let body;
  if (params.kind === 'tool-approval' && approvalPort !== undefined)
    body = <ApprovalView port={approvalPort} botName={botName} listed={listed} />;
  else if (params.kind === 'user-question' && questionPort !== undefined)
    body = <QuestionView port={questionPort} botName={botName} listed={listed} />;
  else
    body = (
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

  return (
    <>
      <Stack.Screen options={{ title }} />
      {body}
    </>
  );
}
