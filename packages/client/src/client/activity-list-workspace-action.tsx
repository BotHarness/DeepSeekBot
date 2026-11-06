import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useRef, useState, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import { GrantRequestCard } from './channel-message-body.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { ChannelMessage, HumanAttentionItem } from './store.js';

export function ActivityListWorkspaceAction({
  source,
  actions,
  t,
}: {
  source: HumanAttentionItem;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [message, setMessage] = useState<ChannelMessage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<AbortController>();
  const mount = useMountedResource<HTMLDivElement>(
    () => () => request.current?.abort(),
    [actions, source.id],
  );
  const readTarget = async (signal: AbortSignal): Promise<ChannelMessage> => {
    if (source.channelId === undefined || source.messageId === undefined)
      throw new Error('Workspace request is unavailable');
    const context = await actions.activityListContext(source.channelId, source.messageId, signal);
    const target = context.find(
      (entry) =>
        entry.id === source.messageId &&
        entry.grantRequest === true &&
        entry.author.kind === 'bot' &&
        entry.author.slug === source.botSlug,
    );
    if (target === undefined) throw new Error('Workspace request is unavailable');
    return target;
  };
  const refreshBeforeOpen = async (): Promise<boolean> => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const target = await readTarget(controller.signal);
    if (controller.signal.aborted) return false;
    setMessage(target);
    return target.grantRequestResolved !== true;
  };
  const open = async (): Promise<void> => {
    if (busy || source.channelId === undefined || source.messageId === undefined) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(false);
    try {
      const target = await readTarget(controller.signal);
      if (!controller.signal.aborted) setMessage(target);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <div ref={mount}>
      {message === undefined ? (
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void open()}>
          {t(busy ? 'grant.loading' : 'activityList.grant.handle')}
        </Button>
      ) : (
        <GrantRequestCard
          message={message}
          actions={actions}
          resolved={message.grantRequestResolved === true}
          channelId={source.channelId}
          beforeOpen={refreshBeforeOpen}
          workspacePickerRequest={1}
          compact
          t={t}
        />
      )}
      {error ? <span role="alert">{t('activityList.failed')}</span> : null}
    </div>
  );
}
