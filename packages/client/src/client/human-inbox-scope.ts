import { useCallback, useMemo, useRef, useState } from 'react';
import type { BridgeActions } from './actions.js';
import type { HumanAttentionPage, HumanInboxState } from './store.js';
import { useMountedResource } from './mounted-resource.js';

export function useHumanActionScope(actions: BridgeActions, botSlug: string | undefined) {
  const [page, setPage] = useState<
    Pick<HumanInboxState, 'items' | 'nextCursor' | 'status' | 'error'>
  >({
    items: [],
    nextCursor: undefined,
    status: 'loading',
    error: undefined,
  });
  const current = useRef(page);
  current.current = page;
  const generation = useRef(0);
  const active = useRef(false);
  const pending = useRef<Promise<void> | undefined>(undefined);
  const refresh = useCallback(
    async (cursor?: string): Promise<void> => {
      if (!active.current || botSlug === undefined || (cursor !== undefined && pending.current))
        return;
      if (pending.current !== undefined) {
        const waitingVersion = generation.current;
        await pending.current;
        if (!active.current || waitingVersion !== generation.current) return;
      }
      const version = ++generation.current;
      const prior = current.current;
      const limit =
        cursor === undefined ? Math.min(3, Math.max(1, Math.ceil(prior.items.length / 50))) : 1;
      setPage((value) => ({ ...value, status: 'loading', error: undefined }));
      const request = (async () => {
        try {
          let next: HumanAttentionPage = { items: [] };
          let nextCursor = cursor;
          for (let i = 0; i < limit; i++) {
            const fetched = await actions.humanActionPage(botSlug, nextCursor);
            if (version !== generation.current) return;
            next = {
              items: [...next.items, ...fetched.items],
              ...(fetched.nextCursor === undefined ? {} : { nextCursor: fetched.nextCursor }),
            };
            nextCursor = fetched.nextCursor;
            if (nextCursor === undefined) break;
          }
          const seen = new Set(next.items.map((item) => item.id));
          const value = {
            items:
              cursor === undefined
                ? next.items
                : [...prior.items.filter((item) => !seen.has(item.id)), ...next.items],
            nextCursor: next.nextCursor,
            status: 'ready' as const,
            error: undefined,
          };
          current.current = value;
          setPage(value);
        } catch (error) {
          if (version === generation.current)
            setPage((value) => ({
              ...value,
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
            }));
        } finally {
          if (version === generation.current) pending.current = undefined;
        }
      })();
      pending.current = request;
      await request;
    },
    [actions, botSlug],
  );
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (botSlug === undefined) return;
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (!pending.current && current.current.items.length <= 150) void refresh();
    }, 10_000);
    return () => {
      window.clearInterval(timer);
      active.current = false;
      generation.current++;
      pending.current = undefined;
    };
  }, [botSlug, refresh]);
  const scoped = useMemo((): BridgeActions => {
    if (botSlug === undefined) return actions;
    const after =
      <Args extends unknown[], Result>(command: (...args: Args) => Promise<Result>) =>
      async (...args: Args): Promise<Result> => {
        try {
          return await command(...args);
        } finally {
          await Promise.allSettled([refresh(), actions.refreshOverview()]);
        }
      };
    return {
      ...actions,
      refreshHumanInbox: () => refresh(),
      loadMoreHumanInbox: () => refresh(current.current.nextCursor),
      answerUserQuestion: after(actions.answerUserQuestion),
      decideToolApproval: after(actions.decideToolApproval),
      resolveWorkspaceGrantRequest: after(actions.resolveWorkspaceGrantRequest),
      replyToHumanAssignment: after(actions.replyToHumanAssignment),
      decideGroupJoin: after(actions.decideGroupJoin),
      dismissHumanInbox: after(actions.dismissHumanInbox),
      allowAutoRejectionOnce: after(actions.allowAutoRejectionOnce),
      snoozeHumanInbox: after(actions.snoozeHumanInbox),
    };
  }, [actions, botSlug, refresh]);
  return { page, actions: scoped, mount };
}
