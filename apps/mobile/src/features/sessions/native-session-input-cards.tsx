import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';
import type { HostClient } from '@botharness/host-client/client';
import type { DecisionResult } from '@botharness/host-client/requests';
import type { SessionTranscriptItem } from '@botharness/host-client/session-detail';
import type { HostSessionPendingInput } from '@botharness/host-protocol/host-sessions';
import { space } from '../../ui/design/tokens';
import { ApprovalCard } from '../../ui/chat/approval-card';
import { QuestionCard } from '../../ui/chat/question-card';
import {
  nativeApprovalPort,
  nativeApprovalRequest,
  nativeQuestionPort,
  type NativeApprovalInput,
  type NativeQuestionInput,
} from './native-session-input';

type Settled = (requestId: string, result: DecisionResult) => void;

function useSameValue<T>(value: T): T {
  const [kept, setKept] = useState(value);
  const same = JSON.stringify(kept) === JSON.stringify(value);
  if (!same) setKept(value);
  return same ? kept : value;
}

export function NativeSessionInputCards({
  client,
  sessionId,
  pending,
  cwd,
  items,
  asker,
  onSettled,
}: {
  client: HostClient;
  sessionId: string;
  pending: readonly HostSessionPendingInput[];
  cwd: string | undefined;
  items: readonly SessionTranscriptItem[];
  asker: string;
  onSettled: Settled;
}) {
  if (pending.length === 0) return null;
  return (
    <View
      testID="session-pending-input"
      style={{ paddingHorizontal: space.x5, paddingBottom: space.x3, gap: space.x3 }}
    >
      {pending.map((input) =>
        input.kind === 'approval' ? (
          <NativeApproval
            key={input.requestId}
            client={client}
            sessionId={sessionId}
            input={input}
            cwd={cwd}
            items={items}
            onSettled={onSettled}
          />
        ) : (
          <NativeQuestion
            key={input.requestId}
            client={client}
            sessionId={sessionId}
            input={input}
            asker={asker}
            onSettled={onSettled}
          />
        ),
      )}
    </View>
  );
}

const NativeApproval = memo(function NativeApproval({
  client,
  sessionId,
  input,
  cwd,
  items,
  onSettled,
}: {
  client: HostClient;
  sessionId: string;
  input: NativeApprovalInput;
  cwd: string | undefined;
  items: readonly SessionTranscriptItem[];
  onSettled: Settled;
}) {
  const request = useSameValue(nativeApprovalRequest(input, { cwd, items }));
  const { requestId } = input;
  const port = useMemo(
    () =>
      nativeApprovalPort(client, sessionId, requestId, request, (result) =>
        onSettled(requestId, result),
      ),
    [client, sessionId, requestId, request, onSettled],
  );
  return <ApprovalCard port={port} content={request} alwaysAllow={false} wide />;
});

const NativeQuestion = memo(function NativeQuestion({
  client,
  sessionId,
  input,
  asker,
  onSettled,
}: {
  client: HostClient;
  sessionId: string;
  input: NativeQuestionInput;
  asker: string;
  onSettled: Settled;
}) {
  const question = useSameValue(input);
  const port = useMemo(
    () =>
      nativeQuestionPort(client, sessionId, question, (result) =>
        onSettled(question.requestId, result),
      ),
    [client, sessionId, question, onSettled],
  );
  return <QuestionCard port={port} botName={asker} wide />;
});
