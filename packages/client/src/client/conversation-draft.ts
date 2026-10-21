import { useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import {
  ComposerDraftStore,
  emptyComposerDraft,
  type ComposerDraft,
  type DraftSnapshot,
} from './composer-draft-store.js';
import type { ClientState } from './store.js';
import type { BridgeActions } from './actions.js';
import type { ChannelComposerUpload } from './channel-composer.js';
import { useMountedResource } from './mounted-resource.js';

let persistent: ComposerDraftStore | undefined;
const unavailable: DraftSnapshot = {
  draft: emptyComposerDraft(),
  versions: [],
  error: 'unavailable',
  needsValidation: false,
  notice: false,
};

function owner(): ComposerDraftStore {
  if (persistent !== undefined) return persistent;
  let storage: Storage | undefined;
  try {
    storage = globalThis.localStorage;
  } catch {
    storage = undefined;
  }
  persistent = new ComposerDraftStore(storage, crypto.randomUUID());
  return persistent;
}

export function conversationDraftKey(state: ClientState): string | undefined {
  const identity = state.composerIdentity;
  if (identity === undefined) return undefined;
  const selection = state.selection;
  const channelId =
    selection?.kind === 'bot'
      ? state.channels.find(
          (channel) => channel.type === 'dm' && channel.botSlug === selection.slug,
        )?.id
      : selection?.kind === 'channel'
        ? state.channels.find((channel) => channel.id === selection.channelId)?.id
        : undefined;
  return channelId === undefined
    ? undefined
    : JSON.stringify([identity.hostId, identity.profileId, identity.humanId, channelId]);
}

export function clearConversationDrafts(): void {
  persistent = undefined;
}

export function useComposerRecovery(
  scope: string | undefined,
  state: ClientState,
  actions: BridgeActions,
) {
  const manager = owner();
  const read = () => (scope === undefined ? unavailable : manager.read(scope));
  const snapshot = useSyncExternalStore(manager.subscribe, read, read);
  const [failedScope, setFailedScope] = useState<string>();
  const [retry, setRetry] = useState(0);
  const mount = useMountedResource<HTMLElement>(
    (node) => {
      if (scope === undefined) return;
      let disposed = false;
      let validating: ComposerDraft | undefined;
      const sync = (event: StorageEvent) => {
        if (event.key === null || event.key.startsWith('botharness.composer.v1:'))
          manager.sync(scope);
      };
      window.addEventListener('storage', sync);
      manager.sync(scope);
      manager.setEditing(scope, node.contains(document.activeElement));
      const validate = () => {
        if (disposed) return;
        const snapshot = manager.read(scope);
        if (
          !snapshot.needsValidation ||
          snapshot.versions.length > 1 ||
          validating === snapshot.draft
        )
          return;
        const channelId = JSON.parse(scope)[3] as string;
        const restored = snapshot.draft;
        validating = restored;
        const uploaded = restored.uploads.flatMap((item) =>
          item.ref === undefined ? [] : [item.ref],
        );
        void actions
          .validateComposerDraft(channelId, uploaded, restored.reply?.id)
          .then((checked) => {
            if (disposed || manager.read(scope).draft !== restored) return;
            const channel = state.channels.find((item) => item.id === channelId);
            const mentions = restored.mentions.filter(
              (mention) =>
                mention.kind !== 'all-bots' &&
                state.bots.some(
                  (bot) => bot.slug === mention.botSlug && bot.paused !== true && !bot.deleted,
                ) &&
                (channel?.type !== 'group' || channel.members.includes(mention.botSlug)),
            );
            const channelRefs = restored.channelRefs.filter((ref) =>
              state.channels.some((item) => item.id === ref.channelId && item.type === 'group'),
            );
            let attachmentIndex = 0;
            const uploads = restored.uploads.map((item): ChannelComposerUpload => {
              const ref =
                item.ref === undefined ? undefined : checked.attachments[attachmentIndex++];
              return ref == null ? { ...item, status: 'error' } : { ...item, ref, status: 'ready' };
            });
            manager.validated(
              scope,
              { mentions, channelRefs, uploads, reply: checked.reply },
              snapshot.notice ||
                mentions.length !== restored.mentions.length ||
                channelRefs.length !== restored.channelRefs.length ||
                (restored.reply !== undefined && checked.reply === undefined) ||
                uploads.some((item) => item.status !== 'ready'),
            );
            setFailedScope(undefined);
          })
          .catch(() => {
            if (!disposed) setFailedScope(scope);
          });
      };
      const schedule = () => queueMicrotask(validate);
      const unsubscribe = manager.subscribe(schedule);
      schedule();
      return () => {
        disposed = true;
        manager.setEditing(scope, false);
        window.removeEventListener('storage', sync);
        unsubscribe();
      };
    },
    [scope, actions, state.bots, state.channels, retry, manager],
  );
  return {
    mount,
    ...snapshot,
    blocked: scope === undefined || snapshot.needsValidation || snapshot.versions.length > 1,
    validationFailed: scope !== undefined && failedScope === scope,
    retry: () => {
      if (scope !== undefined) manager.sync(scope);
      setRetry((value) => value + 1);
    },
    choose: (writer: string) => {
      if (scope !== undefined) manager.choose(scope, writer);
    },
    setEditing: (editing: boolean) => {
      if (scope !== undefined) manager.setEditing(scope, editing);
    },
    update: (patch: Partial<ComposerDraft>) => {
      if (scope !== undefined) manager.update(scope, patch);
    },
  };
}

export function useConversationDraft<Key extends keyof ComposerDraft>(
  scope: string | undefined,
  field: Key,
  initial: ComposerDraft[Key],
): [ComposerDraft[Key], Dispatch<SetStateAction<ComposerDraft[Key]>>] {
  const manager = owner();
  const snapshot = (): DraftSnapshot => (scope === undefined ? unavailable : manager.read(scope));
  const value = useSyncExternalStore(manager.subscribe, snapshot, snapshot).draft[field];
  const update: Dispatch<SetStateAction<ComposerDraft[Key]>> = (next) => {
    if (scope === undefined) return;
    const previous = snapshot().draft[field] ?? initial;
    const resolved = typeof next === 'function' ? next(previous) : next;
    manager.update(scope, { [field]: resolved });
  };
  return [value, update];
}

export function appendConversationDraft(scope: string, text: string): void {
  const manager = owner();
  const current = manager.read(scope).draft.text;
  manager.update(scope, { text: current.trim().length === 0 ? text : `${current}\n\n${text}` });
}
