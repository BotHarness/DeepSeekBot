import type { HostClient } from './client';
import { attachmentsOf, type MessageAttachment } from './conversation';
import type {
  ChannelLiveFrame,
  JournalEntry,
  JournalPage,
  RosterLiveFrame,
  WireAuthor,
} from './wire';

export interface ChannelFile {
  key: string;
  messageId: string;
  at: string;
  author: WireAuthor;
  attachment: MessageAttachment;
}

export interface ChannelFilesSnapshot {
  files: readonly ChannelFile[];
  status: 'opening' | 'ready' | 'interrupted' | 'refused';
  hasOlder: boolean;
  loadingOlder: boolean;
  pageFailed: boolean;
}

export interface ChannelFiles {
  getSnapshot(): ChannelFilesSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
  retry(): void;
  loadOlder(): Promise<void>;
}

export function createChannelFiles({
  host,
  channelId,
  pageSize = 100,
}: {
  host: HostClient;
  channelId: string;
  pageSize?: number;
}): ChannelFiles {
  const listeners = new Set<() => void>();
  const entries = new Map<string, JournalEntry>();
  const purged = new Set<string>();
  const live = new Set<string>();
  let running = false;
  let generation = 0;
  let historyGeneration = 0;
  let channelReady = false;
  let rosterReady = false;
  let through = 0;
  let before = 0;
  let offChannel: (() => void) | undefined;
  let offRoster: (() => void) | undefined;
  let offHost: (() => void) | undefined;
  let snapshot: ChannelFilesSnapshot = {
    files: [],
    status: 'opening',
    hasOlder: false,
    loadingOlder: false,
    pageFailed: false,
  };

  const publish = (update: Partial<ChannelFilesSnapshot> = {}) => {
    const seen = new Set<string>();
    const files: ChannelFile[] = [];
    for (const entry of [...entries.values()].sort((a, b) => b.revision - a.revision)) {
      const message = entry.message;
      for (const attachment of attachmentsOf(entry, host.resource)) {
        const identity = attachment.identity ?? attachment.key;
        if (seen.has(identity)) continue;
        seen.add(identity);
        files.push({
          key: identity,
          messageId: message.id,
          at: message.at,
          author: message.author,
          attachment,
        });
      }
    }
    snapshot = { ...snapshot, ...update, files };
    for (const listener of listeners) listener();
  };

  const accept = (page: readonly JournalEntry[], source: 'history' | 'live') => {
    for (const entry of page) {
      if (entry.channelId !== channelId) continue;
      const id = entry.message.id;
      if (source === 'history' && live.has(id)) continue;
      if (source === 'live') live.add(id);
      if (entry.message.contentPurge !== undefined) purged.add(id);
      entries.delete(id);
      if (
        !purged.has(id) &&
        (entry.message.attachments?.length ||
          entry.message.bridgeMedia?.items.length ||
          entry.message.clearedAttachments?.length)
      )
        entries.set(id, entry);
    }
  };

  const refuse = () => {
    generation++;
    entries.clear();
    publish({ status: 'refused', hasOlder: false, loadingOlder: false, pageFailed: false });
  };

  const follow = () => {
    offChannel?.();
    const epoch = ++generation;
    channelReady = false;
    entries.clear();
    live.clear();
    through = 0;
    before = 0;
    publish({ status: 'opening', hasOlder: false, loadingOlder: false, pageFailed: false });
    offChannel = host.follow(
      'botharness/followChannel',
      { channelId, limit: pageSize },
      {
        item(value) {
          if (!running || epoch !== generation) return;
          const frame = value as ChannelLiveFrame;
          if (frame.type === 'opened') {
            historyGeneration++;
            channelReady = true;
            entries.clear();
            live.clear();
            through = frame.cursor;
            before = frame.page?.entries[0]?.revision ?? 0;
            accept(frame.page?.entries ?? [], 'history');
            publish({
              status: rosterReady ? 'ready' : 'opening',
              hasOlder: frame.page?.hasOlder ?? false,
              loadingOlder: false,
              pageFailed: false,
            });
          } else if (frame.type === 'entry' && frame.entry.channelId === channelId) {
            if (frame.entry.revision > through + 1) {
              follow();
              return;
            }
            through = Math.max(through, frame.entry.revision);
            if (before === 0) before = frame.entry.revision;
            accept([frame.entry], 'live');
            publish();
          }
        },
        interrupted() {
          if (running && epoch === generation) {
            channelReady = false;
            historyGeneration++;
            publish({ status: 'interrupted', loadingOlder: false });
          }
        },
        refused() {
          if (running && epoch === generation) refuse();
        },
      },
    );
  };

  const stop = () => {
    running = false;
    generation++;
    channelReady = rosterReady = false;
    offChannel?.();
    offRoster?.();
    offHost?.();
    offChannel = offRoster = offHost = undefined;
    entries.clear();
    live.clear();
    purged.clear();
    snapshot = {
      files: [],
      status: 'opening',
      hasOlder: false,
      loadingOlder: false,
      pageFailed: false,
    };
  };

  const start = () => {
    if (running) return;
    running = true;
    offHost = host.subscribe(() => {
      const status = host.getSnapshot().connection.status;
      if (status === 'refused') refuse();
      else if (
        status === 'connected' &&
        channelReady &&
        rosterReady &&
        snapshot.status === 'interrupted'
      )
        publish({ status: 'ready' });
      else if (status === 'unreachable' || status === 'stopped')
        publish({ status: 'interrupted', loadingOlder: false });
    });
    offRoster = host.follow(
      'botharness/followRoster',
      {},
      {
        item(value) {
          if (!running) return;
          const frame = value as RosterLiveFrame;
          if (frame.type !== 'baseline' && frame.type !== 'purged') return;
          if (frame.type === 'baseline') rosterReady = true;
          for (const placement of frame.placements) {
            if (
              typeof placement !== 'object' ||
              placement === null ||
              !('channelId' in placement) ||
              placement.channelId !== channelId ||
              !('messageId' in placement) ||
              typeof placement.messageId !== 'string'
            )
              continue;
            purged.add(placement.messageId);
            entries.delete(placement.messageId);
          }
          publish(
            channelReady && rosterReady && snapshot.status !== 'refused' ? { status: 'ready' } : {},
          );
        },
        interrupted() {
          if (running) {
            rosterReady = false;
            publish({ status: 'interrupted' });
          }
        },
        refused() {
          if (running) refuse();
        },
      },
    );
    if (host.getSnapshot().connection.status === 'refused') refuse();
    else {
      follow();
      const status = host.getSnapshot().connection.status;
      if (status === 'unreachable' || status === 'stopped') publish({ status: 'interrupted' });
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    stop,
    retry() {
      stop();
      start();
    },
    async loadOlder() {
      if (
        !running ||
        snapshot.status !== 'ready' ||
        !snapshot.hasOlder ||
        snapshot.loadingOlder ||
        before === 0
      )
        return;
      const epoch = generation;
      const historyEpoch = historyGeneration;
      const boundary = before;
      publish({ loadingOlder: true, pageFailed: false });
      try {
        const page = await host.call<JournalPage>('channelJournalPage', {
          channelId,
          through,
          before: boundary,
          limit: pageSize,
        });
        if (
          !running ||
          epoch !== generation ||
          historyEpoch !== historyGeneration ||
          snapshot.status !== 'ready' ||
          before !== boundary
        )
          return;
        if (
          page.entries.some(
            (entry) => entry.channelId !== channelId || entry.revision >= boundary,
          ) ||
          (page.hasOlder && page.entries.length === 0)
        )
          throw new Error('invalid-history-page');
        accept(page.entries, 'history');
        before = page.entries[0]?.revision ?? 0;
        publish({ hasOlder: page.hasOlder, loadingOlder: false });
      } catch {
        if (running && epoch === generation && historyEpoch === historyGeneration)
          publish({ loadingOlder: false, pageFailed: true });
      }
    },
  };
}
