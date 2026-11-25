import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { MethodRefused, type HostClient } from '@botharness/host-client/client';
import {
  mergeLive,
  sessionLive,
  sessionTranscript,
  type SessionLiveSnapshot,
  type SessionTranscript,
} from '@botharness/host-client/session-detail';
import type { HostSessionPendingInput } from '@botharness/host-protocol/host-sessions';
import { sessionReadHost } from '../../host/session-detail';
import { pendingInputKey } from '../../features/sessions/native-session-input';

const LIVE_RETRY_MS = 10_000;
const TRANSCRIPT_REFRESH_MS = 15_000;

type View = {
  transcript?: SessionTranscript;
  live?: SessionLiveSnapshot | undefined;
  pendingInput?: HostSessionPendingInput[] | undefined;
  error?: 'unavailable' | 'load';
};

export function useSessionTranscript(
  client: HostClient,
  slug: string | null,
  id: string,
  online: boolean,
) {
  const [view, setView] = useState<View>({});
  const [attempt, setAttempt] = useState(0);
  const reload = useRef<() => void>(undefined);

  useFocusEffect(
    useCallback(() => {
      if (!online) return;
      const abort = new AbortController();
      const host = sessionReadHost(client, abort.signal);
      let latest: SessionLiveSnapshot | undefined;
      let durable: SessionTranscript | undefined;
      let pending: HostSessionPendingInput[] | undefined;
      let liveObservations = 0;
      let loading = false;
      let again = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let retry: ReturnType<typeof setTimeout> | undefined;

      function publish() {
        if (durable === undefined) return;
        const live = latest !== undefined && latest.seq <= durable.seq ? latest : undefined;
        setView({ transcript: durable, live, pendingInput: pending });
      }

      function fail(error: unknown) {
        if (abort.signal.aborted) return;
        if (error instanceof MethodRefused) {
          setView({ error: 'unavailable' });
          abort.abort();
        } else if (durable === undefined) {
          setView((current) => (current.transcript === undefined ? { error: 'load' } : current));
        }
      }

      function load() {
        if (abort.signal.aborted) return;
        if (loading) {
          again = true;
          return;
        }
        clearTimeout(timer);
        loading = true;
        const observed = liveObservations;
        void sessionTranscript(host, slug, id)
          .then((value) => {
            if (abort.signal.aborted) return;
            durable = value;
            if (value.pendingInput !== undefined && observed === liveObservations)
              pending = value.pendingInput;
            publish();
          }, fail)
          .finally(() => {
            loading = false;
            if (abort.signal.aborted) return;
            if (again) {
              again = false;
              load();
            } else {
              timer = setTimeout(load, TRANSCRIPT_REFRESH_MS);
            }
          });
      }

      async function follow(after?: number) {
        if (abort.signal.aborted) return;
        try {
          const next = await sessionLive(host, slug, id, after);
          if (abort.signal.aborted) return;
          const previous = latest;
          latest = next;
          const asked =
            next.pendingInput !== undefined &&
            pendingInputKey(next.pendingInput) !== pendingInputKey(pending);
          if (next.pendingInput !== undefined) {
            pending = next.pendingInput;
            liveObservations += 1;
          }
          if (durable !== undefined && next.seq > durable.seq) {
            if (asked) publish();
            if (previous?.seq !== next.seq) load();
          } else if (asked || previous?.revision !== next.revision) {
            publish();
          }
          void follow(next.revision);
        } catch (error) {
          fail(error);
          if (!abort.signal.aborted) retry = setTimeout(() => void follow(), LIVE_RETRY_MS);
        }
      }

      reload.current = load;
      load();
      void follow();
      return () => {
        abort.abort();
        reload.current = undefined;
        clearTimeout(timer);
        clearTimeout(retry);
      };
    }, [client, slug, id, online, attempt]),
  );

  const refresh = useCallback(() => reload.current?.(), []);
  const live = view.live?.items;
  const transcript = view.transcript;
  const items = useMemo(() => {
    if (transcript === undefined) return [];
    if (live === undefined || live.length === 0) return transcript.items;
    return mergeLive(
      transcript.items,
      live.map((item) => (item.kind === 'tool' ? { ...item, status: 'running' } : item)),
    );
  }, [transcript, live]);

  return {
    ...view,
    items,
    running:
      transcript?.running === true ||
      transcript?.engine?.state === 'running' ||
      (live?.length ?? 0) > 0,
    refresh,
    retry: () => {
      setView({});
      setAttempt((value) => value + 1);
    },
  };
}
