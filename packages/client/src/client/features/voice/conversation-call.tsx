import type { VoiceDictationPort } from '../../composer-dictation.js';
import { useMemo, type ReactElement } from 'react';
import type { BridgeActions } from '../../actions.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { BotSummary, ChannelSummary } from '../../store.js';
import { DmCallControl } from '../../dm-call.js';

export function useConversationDictation(
  actions: BridgeActions,
  channel: ChannelSummary | undefined,
) {
  const dictationSlug = channel?.type === 'dm' ? channel.botSlug : undefined;
  const dictationPort = useMemo(() => {
    const port: unknown = actions.dictationPort?.(dictationSlug);
    if (port instanceof Promise) port.catch(() => undefined);
    return typeof (port as VoiceDictationPort | undefined)?.readiness === 'function'
      ? (port as VoiceDictationPort)
      : undefined;
  }, [actions, dictationSlug]);

  return dictationPort;
}

export function renderConversationCall(
  profileBot: BotSummary,
  channel: ChannelSummary,
  actions: BridgeActions,
  t: BotHarnessTranslate,
): ReactElement {
  return (
    <DmCallControl
      slug={profileBot.slug}
      name={profileBot.displayName}
      onReturn={() => void actions.openChannel(channel.id).catch(() => undefined)}
      t={t}
    />
  );
}

export function renderHeaderConversationCall(
  profileBot: BotSummary,
  channel: ChannelSummary,
  actions: BridgeActions,
  t: BotHarnessTranslate,
): ReactElement {
  return (
    <DmCallControl
      slug={profileBot.slug}
      name={profileBot.displayName}
      onReturn={() => void actions.openChannel(channel.id).catch(() => undefined)}
      variant="header"
      t={t}
    />
  );
}
