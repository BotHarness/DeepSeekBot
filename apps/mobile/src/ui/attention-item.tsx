import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { View, type ViewInstance } from 'react-native';

import {
  allowAutoRejectionOnce,
  clearAttentionItem,
  decideJoinRequest,
  findAttentionItem,
  loadAssignmentContext,
  replyToAssignment,
  type AttentionRef,
} from '../host/attention-actions';
import type { HostClient } from '../host/client';
import type { HumanAttentionItem } from '../host/wire';
import { AssignmentView, AutoRejectionView, JoinRequestView, RepairView } from './attention-view';
import { useMounted } from './mounted';
import { errorText, LoadFailed, Loading } from './request-parts';

export const ATTENTION_KINDS = new Set([
  'auto-rejection',
  'group-join-request',
  'assignment-waiting-human',
  'assignment-blocked',
  'bot-message-needs-repair',
]);

type Phase =
  | { kind: 'loading' }
  | { kind: 'failed'; error: string }
  | { kind: 'ready'; item: HumanAttentionItem | undefined };

export function AttentionItemView({
  client,
  target,
  known,
  botName,
  after,
  onOpenChat,
  fallback,
}: {
  client: HostClient;
  target: AttentionRef;
  known?: HumanAttentionItem | undefined;
  botName: string;
  after?(): void;
  onOpenChat?(item: HumanAttentionItem): void;
  fallback: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>(
    known === undefined ? { kind: 'loading' } : { kind: 'ready', item: known },
  );
  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      setPhase({ kind: 'ready', item: await findAttentionItem(client, target) });
    } catch (error) {
      setPhase({ kind: 'failed', error: errorText(error) });
    }
  }, [client, target]);
  const mount = useMounted<ViewInstance>(() => {
    if (known === undefined) void load();
  }, [load]);

  const item = phase.kind === 'ready' ? phase.item : undefined;
  const ports = useMemo(() => {
    if (item === undefined) return undefined;
    return {
      allowOnce: () => allowAutoRejectionOnce(client, item.id),
      clear: () => clearAttentionItem(client, item),
      decide: (accept: boolean) =>
        decideJoinRequest(client, item.channelId ?? '', item.requestId ?? '', accept),
      load: () =>
        loadAssignmentContext(
          client,
          item.botSlug,
          item.assignmentSessionId ?? '',
          item.sourceEventId ?? '',
        ),
      reply: (body: string) =>
        replyToAssignment(
          client,
          item.botSlug,
          item.assignmentSessionId ?? '',
          item.sourceEventId ?? '',
          body,
        ),
    };
  }, [client, item]);

  let body: ReactNode;
  if (phase.kind === 'loading') body = <Loading />;
  else if (phase.kind === 'failed')
    body = <LoadFailed error={phase.error} onRetry={() => void load()} />;
  else if (item === undefined || ports === undefined) body = fallback;
  else if (item.kind === 'auto-rejection')
    body = (
      <AutoRejectionView
        item={item}
        botName={botName}
        port={ports}
        {...(after === undefined ? {} : { after })}
      />
    );
  else if (
    item.kind === 'group-join-request' &&
    item.channelId !== undefined &&
    item.requestId !== undefined
  )
    body = (
      <JoinRequestView
        item={item}
        botName={botName}
        port={ports}
        {...(after === undefined ? {} : { after })}
      />
    );
  else if (item.kind === 'bot-message-needs-repair')
    body = (
      <RepairView
        item={item}
        botName={botName}
        port={ports}
        {...(after === undefined ? {} : { after })}
        {...(onOpenChat === undefined ? {} : { onOpenChat: () => onOpenChat(item) })}
      />
    );
  else if (
    (item.kind === 'assignment-waiting-human' || item.kind === 'assignment-blocked') &&
    item.assignmentSessionId !== undefined &&
    item.sourceEventId !== undefined
  )
    body = (
      <AssignmentView
        item={item}
        botName={botName}
        port={ports}
        {...(after === undefined ? {} : { after })}
      />
    );
  else body = fallback;
  return (
    <View ref={mount} style={{ flex: 1 }}>
      {body}
    </View>
  );
}
