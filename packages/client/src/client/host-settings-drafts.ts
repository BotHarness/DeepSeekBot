export type HostDraftChoice = 'save' | 'discard' | 'cancel';
export interface HostSettingsDraft {
  dirty(): boolean;
  save(): Promise<boolean>;
  discard(): void;
}

export function createHostSettingsDrafts() {
  const drafts = new Map<string, Map<symbol, HostSettingsDraft>>();
  const prompts = new Map<string, { token: symbol; choose(): Promise<HostDraftChoice> }>();
  const pending = new Map<string, Promise<boolean>>();
  return {
    register(hostId: string, draft: HostSettingsDraft) {
      const token = Symbol();
      const entries = drafts.get(hostId) ?? new Map<symbol, HostSettingsDraft>();
      entries.set(token, draft);
      drafts.set(hostId, entries);
      return () => {
        entries.delete(token);
        if (entries.size === 0 && drafts.get(hostId) === entries) drafts.delete(hostId);
      };
    },
    prompt(hostId: string, choose: () => Promise<HostDraftChoice>) {
      const token = Symbol();
      prompts.set(hostId, { token, choose });
      return () => {
        if (prompts.get(hostId)?.token === token) prompts.delete(hostId);
      };
    },
    async prepare(hostId: string): Promise<boolean> {
      const existing = pending.get(hostId);
      if (existing) return existing;
      const operation = (async () => {
        const entries = [...(drafts.get(hostId)?.entries() ?? [])].filter(([, draft]) =>
          draft.dirty(),
        );
        if (entries.length === 0) return true;
        const prompt = prompts.get(hostId);
        if (!prompt) return false;
        const choice = await prompt.choose();
        if (choice === 'cancel' || prompts.get(hostId) !== prompt) return false;
        for (const [token, draft] of entries) {
          if (drafts.get(hostId)?.get(token) !== draft) return false;
          if (choice === 'save') {
            try {
              if (!(await draft.save())) return false;
            } catch {
              return false;
            }
          } else {
            try {
              draft.discard();
            } catch {
              return false;
            }
          }
          if (prompts.get(hostId) !== prompt || drafts.get(hostId)?.get(token) !== draft)
            return false;
        }
        return ![...(drafts.get(hostId)?.values() ?? [])].some((draft) => draft.dirty());
      })();
      pending.set(hostId, operation);
      try {
        return await operation;
      } finally {
        pending.delete(hostId);
      }
    },
  };
}

export const hostSettingsDrafts = createHostSettingsDrafts();
