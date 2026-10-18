import type { Conversation, ConversationDraft, ConversationMessage } from './conversation';
import { createTextPlayback, playbackTiming, type TextPlayback } from './text-playback';

export type BubblePlayback = { message: ConversationMessage; streaming: boolean };

type Queue = {
  key: string;
  draftId?: string;
  messageId?: string;
  base: ConversationMessage;
  publishedBase: ConversationMessage;
  player: TextPlayback;
  snapshot: BubblePlayback;
  completedAt?: number | undefined;
};

export function createConversationPlayback(
  source: Pick<Conversation, 'getSnapshot' | 'getTimelineSnapshot' | 'subscribe'>,
) {
  const queues = new Map<string, Queue>();
  const bindings = new Map<string, string>();
  const listeners = new Set<() => void>();
  const bubbles = new Map<string, Set<() => void>>();
  let previous = source.getSnapshot();
  let active = true;
  let following = true;
  let live = previous.status === 'live';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: (() => void) | undefined;

  const changed = (queue: Queue) => {
    const state = queue.player.getSnapshot();
    if (state.phase === 'complete') queue.completedAt ??= Date.now();
    else queue.completedAt = undefined;
    const streaming =
      active &&
      live &&
      (state.phase !== 'complete' || Date.now() < queue.completedAt! + playbackTiming.settle);
    if (
      queue.snapshot.message.id === queue.base.id &&
      queue.snapshot.message.body === state.body &&
      queue.snapshot.streaming === streaming &&
      (queue.messageId === undefined
        ? queue.snapshot.message.bot === queue.base.bot
        : queue.publishedBase === queue.base)
    )
      return;
    queue.snapshot = {
      message: state.body === queue.base.body ? queue.base : { ...queue.base, body: state.body },
      streaming,
    };
    queue.publishedBase = queue.base;
    for (const listener of bubbles.get(queue.key) ?? []) listener();
  };
  const add = (key: string, base: ConversationMessage, initial: string, draftId?: string) => {
    const queue: Queue = {
      key,
      ...(draftId === undefined ? { messageId: base.id } : { draftId }),
      base,
      publishedBase: base,
      player: createTextPlayback(initial),
      snapshot: { message: { ...base, body: initial }, streaming: true },
    };
    queues.set(key, queue);
    return queue;
  };
  const draftMessage = (draft: ConversationDraft): ConversationMessage => ({
    id: `draft:${draft.draftId}`,
    at: '',
    author: 'bot',
    bot: draft.botSlug,
    body: draft.body,
    attachments: [],
    delivery: 'pending',
  });
  for (const draft of previous.drafts)
    add(`draft:${draft.draftId}`, draftMessage(draft), draft.body, draft.draftId);

  const tick = () => {
    timer = undefined;
    if (!active || !following || listeners.size === 0) return;
    const now = Date.now();
    const occupied = new Set<string>();
    for (const queue of queues.values()) {
      if (queue.player.getSnapshot().phase === 'complete') {
        changed(queue);
        continue;
      }
      const bot = queue.base.bot ?? queue.key;
      if (occupied.has(bot)) continue;
      occupied.add(bot);
      queue.player.advance(now);
      changed(queue);
    }
    schedule();
  };
  const schedule = () => {
    const pending = [...queues.values()].some(
      (queue) =>
        queue.player.getSnapshot().pending > 0 ||
        (queue.snapshot.streaming && queue.player.getSnapshot().phase === 'complete'),
    );
    if (!pending) {
      clearTimeout(timer);
      timer = undefined;
      return;
    }
    if (timer === undefined && active && following && listeners.size > 0 && pending)
      timer = setTimeout(tick, playbackTiming.frame);
  };
  const update = () => {
    const current = source.getSnapshot();
    live = current.status === 'live';
    const now = Date.now();
    const ids = new Set(current.messages.map((message) => message.id));
    const previousIds = new Set(previous.messages.map((message) => message.id));
    const draftIds = new Set(current.drafts.map((draft) => draft.draftId));
    for (const draft of current.drafts) {
      const key = `draft:${draft.draftId}`;
      const queue = queues.get(key) ?? add(key, draftMessage(draft), '', draft.draftId);
      queue.base = draftMessage(draft);
      queue.player.receive(draft.body, false, now);
      if (!active || current.status !== 'live') queue.player.flush();
      changed(queue);
    }
    for (const message of current.messages) {
      let key = bindings.get(message.id);
      let queue = key === undefined ? undefined : queues.get(key);
      if (
        queue === undefined &&
        !previousIds.has(message.id) &&
        message.author === 'bot' &&
        message.activity === undefined &&
        message.card === undefined &&
        message.body.trim() !== '' &&
        current.status === 'live' &&
        previous.status === 'live' &&
        !previous.fromCache &&
        !current.fromCache &&
        active
      ) {
        const candidates = [...queues.values()].filter(
          (entry) =>
            entry.messageId === undefined &&
            entry.draftId !== undefined &&
            !draftIds.has(entry.draftId) &&
            entry.base.bot === message.bot,
        );
        const matching = candidates.filter((entry) => message.body.startsWith(entry.base.body));
        queue =
          matching.length === 1 ? matching[0] : candidates.length === 1 ? candidates[0] : undefined;
        queue ??= add(message.id, message, '');
        key = queue.key;
        queue.messageId = message.id;
        bindings.set(message.id, key);
      }
      if (queue !== undefined) {
        queue.base = message;
        queue.player.receive(message.body, true, now);
        if (!active || current.status !== 'live') queue.player.flush();
        changed(queue);
      }
    }
    for (const [key, queue] of queues) {
      if (
        queue.messageId === undefined
          ? queue.draftId === undefined || !draftIds.has(queue.draftId)
          : !ids.has(queue.messageId)
      ) {
        queues.delete(key);
        if (queue.messageId !== undefined) bindings.delete(queue.messageId);
        for (const listener of bubbles.get(key) ?? []) listener();
      }
    }
    previous = current;
    for (const listener of listeners) listener();
    schedule();
  };
  return {
    getTimelineSnapshot: source.getTimelineSnapshot,
    rowKey: (messageId: string) => bindings.get(messageId) ?? messageId,
    getBubble: (key: string) => queues.get(key)?.snapshot,
    subscribeBubble(key: string, listener: () => void) {
      const entries = bubbles.get(key) ?? new Set<() => void>();
      bubbles.set(key, entries);
      entries.add(listener);
      return () => {
        entries.delete(listener);
        if (entries.size === 0) bubbles.delete(key);
      };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        stop = source.subscribe(update);
        update();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop?.();
          stop = undefined;
          clearTimeout(timer);
          timer = undefined;
        }
      };
    },
    setFollowing(next: boolean) {
      if (following === next) return;
      following = next;
      clearTimeout(timer);
      timer = undefined;
      for (const queue of queues.values()) queue.player.resetClock(Date.now());
      if (next) schedule();
    },
    setActive(next: boolean) {
      active = next;
      clearTimeout(timer);
      timer = undefined;
      for (const queue of queues.values()) {
        if (!next) {
          queue.player.flush();
          changed(queue);
        }
        queue.player.resetClock(Date.now());
      }
      if (next) schedule();
    },
    diagnostics: () =>
      [...queues.values()].slice(-32).map((queue) => {
        const { body: _body, ...state } = queue.player.getSnapshot();
        return { key: queue.key, ...state };
      }),
  };
}

export type ConversationPlayback = ReturnType<typeof createConversationPlayback>;
