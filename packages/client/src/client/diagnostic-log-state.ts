import { logClient } from './diagnostic-log.js';
import type { ClientState, ConversationSelection } from './store.js';

function selectionFields(selection: ConversationSelection | undefined): Record<string, string> {
  if (selection === undefined) return { kind: 'none' };
  if (selection.kind === 'bot')
    return { kind: 'bot', bot: selection.slug, ...(selection.profile ? { view: 'profile' } : {}) };
  if (selection.kind === 'channel') return { kind: 'channel', channel: selection.channelId };
  return { kind: 'inbox' };
}

function selectionKey(selection: ConversationSelection | undefined): string {
  return JSON.stringify(selectionFields(selection));
}

export function watchClientLogState(store: {
  getSnapshot(): ClientState;
  subscribe(listener: () => void): () => void;
}): () => void {
  let previous = store.getSnapshot();
  let loadingSince: number | undefined;
  logClient('navigation', 'mode', { mode: previous.mode });
  return store.subscribe(() => {
    const next = store.getSnapshot();
    const before = previous;
    previous = next;
    if (next.mode !== before.mode) logClient('navigation', 'mode', { mode: next.mode });
    if (selectionKey(next.selection) !== selectionKey(before.selection))
      logClient('navigation', 'select', selectionFields(next.selection));
    const conversation = next.conversation;
    const prior = before.conversation;
    if (conversation.status !== prior.status) {
      if (conversation.status === 'loading') loadingSince = Date.now();
      const ms = loadingSince === undefined ? undefined : Date.now() - loadingSince;
      if (conversation.status === 'ready' || conversation.status === 'error')
        loadingSince = undefined;
      logClient(
        conversation.status === 'error' ? 'error' : 'lifecycle',
        `conversation-${conversation.status}`,
        {
          ...(conversation.channel === undefined ? {} : { channel: conversation.channel.id }),
          messages: conversation.messages.length,
          ...(ms === undefined || conversation.status === 'loading' ? {} : { ms }),
          ...(conversation.error === undefined ? {} : { message: conversation.error }),
        },
        conversation.status === 'error' ? 'error' : 'info',
      );
    } else if (
      conversation.status === 'ready' &&
      prior.messages.length > 0 &&
      conversation.messages.length === 0 &&
      conversation.channel?.id === prior.channel?.id
    )
      logClient(
        'invariant',
        'conversation-emptied',
        { channel: conversation.channel?.id ?? null, previous: prior.messages.length },
        'warn',
      );
    const timeline = conversation.timeline;
    if (timeline.olderError !== undefined && timeline.olderError !== prior.timeline.olderError)
      logClient('error', 'timeline-older-failed', { message: timeline.olderError }, 'warn');
    if (timeline.newerError !== undefined && timeline.newerError !== prior.timeline.newerError)
      logClient('error', 'timeline-newer-failed', { message: timeline.newerError }, 'warn');
    if (next.status !== before.status && next.status === 'error')
      logClient('error', 'client-status-error', { message: next.error ?? '' });
  });
}
