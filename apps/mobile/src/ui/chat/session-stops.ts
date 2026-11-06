import { useState } from 'react';

import { errorText } from '../../host/bot-settings';
import type { RosterBot } from '../../host/client';
import {
  liveStopping,
  runningSessions,
  sessionKey,
  type SessionStopper,
} from '../../host/session-stop';

export interface SessionStops {
  stopping(botSlug: string, sessionId: string): boolean;
  stop(botSlug: string, sessionId: string): void;
  stopAll(botSlug: string): void;
  error: string | undefined;
}

export function useSessionStops(
  stopper: SessionStopper | undefined,
  bots: readonly RosterBot[],
): SessionStops | undefined {
  const [requested, setRequested] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<string>();
  const live = liveStopping(requested, bots);
  if (live.size !== requested.size) setRequested(live);
  if (stopper === undefined) return undefined;
  const mark = (keys: string[]) => setRequested((current) => new Set([...current, ...keys]));
  const unmark = (keys: string[]) =>
    setRequested((current) => new Set([...current].filter((key) => !keys.includes(key))));
  const run = (keys: string[], stop: () => Promise<void>) => {
    if (keys.length === 0) return;
    setError(undefined);
    mark(keys);
    stop().catch((failure: unknown) => {
      unmark(keys);
      setError(errorText(failure));
    });
  };
  return {
    stopping: (botSlug, sessionId) => live.has(sessionKey(botSlug, sessionId)),
    stop: (botSlug, sessionId) => {
      if (live.has(sessionKey(botSlug, sessionId))) return;
      run([sessionKey(botSlug, sessionId)], () => stopper.stopSession(botSlug, sessionId));
    },
    stopAll: (botSlug) => {
      const bot = bots.find((entry) => entry.slug === botSlug);
      const keys = runningSessions(bot)
        .map((session) => sessionKey(botSlug, session.id))
        .filter((key) => !live.has(key));
      run(keys, () => stopper.stopBot(botSlug));
    },
    error,
  };
}
