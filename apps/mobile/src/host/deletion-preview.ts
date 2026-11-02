import { previewDeletion, type DeletionClient, type DeletionPreview } from './deletion';

export function deletionPreviewStore(client: DeletionClient, slug: string | undefined) {
  let snapshot: { preview?: DeletionPreview; failed?: boolean } = {};
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: typeof snapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const load = async () => {
    const current = ++generation;
    publish({});
    if (!slug) return;
    try {
      const preview = await previewDeletion(client, slug);
      if (current === generation && listeners.size) publish({ preview });
    } catch {
      if (current === generation && listeners.size) publish({ failed: true });
    }
  };
  return {
    getSnapshot: () => snapshot,
    active: () => listeners.size > 0,
    setPreview: (preview: DeletionPreview | undefined) => publish(preview ? { preview } : {}),
    load,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) void load();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) generation++;
      };
    },
  };
}
