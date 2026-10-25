import { PrivateInputForm } from '../../src/ui/private-input-form';
import { Text } from '../../src/ui/primitives/system-text';
import { Stack, useLocalSearchParams, useNavigationContainerRef, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView } from 'react-native';

import { useHostSession, useHostSnapshot, useInbox } from '../../src/host/host-session';
import { channelDestination, navigateChannel } from '../../src/ui/shell/channel-navigation';
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
import { Notice } from '../../src/ui/request-parts';
import { useStrings } from '../../src/ui/strings';
import { useTheme } from '../../src/ui/theme';

type Params = {
  id: string;
  kind: string;
  botSlug: string;
  summary?: string;
  channelId?: string;
  messageId?: string;
  hostId?: string;
};

export default function InboxItemScreen() {
  const t = useStrings();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { saved, client, inbox } = useHostSession();
  const [openedOn, setOpenedOn] = useState(saved?.hostId);
  if (openedOn === undefined && saved?.hostId !== undefined) setOpenedOn(saved.hostId);
  const expectedHostId = params.hostId ?? openedOn;
  const navigation = useNavigationContainerRef();
  const [openNotice, setOpenNotice] = useState<string>();
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
    </ScrollView>
  );
  let body;
  if (expectedHostId !== undefined && saved?.hostId !== expectedHostId)
    body = <Notice tone="warning">{t.sourceChanged}</Notice>;
  else if (params.kind === 'private-input' && client && ref)
    body = (
      <PrivateInputForm
        key={`${saved?.hostId}:${ref.messageId}`}
        client={client}
        target={ref}
        after={() => void inbox?.refresh()}
      />
    );
  else if (params.kind === 'tool-approval' && approvalPort !== undefined)
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
          if (!saved || saved.hostId !== expectedHostId) {
            setOpenNotice(t.sourceChanged);
            return;
          }
          const destination = channelDestination(saved.hostId, item, snapshot.roster);
          if (destination && navigateChannel(navigation, destination)) setOpenNotice(undefined);
          else setOpenNotice(snapshot.roster ? t.noChannel : t.channelOpeningNotReady);
        }}
        fallback={fallback}
      />
    );
  else body = fallback;

  return (
    <>
      <Stack.Screen options={{ title }} />
      {openNotice === undefined ? null : <Notice tone="warning">{openNotice}</Notice>}
      {body}
    </>
  );
}
