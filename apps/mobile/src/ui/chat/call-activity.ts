import type { CallActivityPhase } from './call-model';

export type CallActivityProps = {
  name: string;
  phase: CallActivityPhase;
  startedAt: number;
  muted: boolean;
  locale: 'en' | 'zh';
};

export interface CallActivityHandle {
  update(props: CallActivityProps): Promise<void>;
  end(): Promise<void>;
}

export interface CallActivityNative {
  start(props: CallActivityProps): Promise<CallActivityHandle | undefined>;
}

export const CALL_ACTIVITY_TARGETS = {
  hangUp: 'call-hang-up',
  mute: 'call-mute',
} as const;

const same = (a: CallActivityProps, b: CallActivityProps) =>
  a.name === b.name &&
  a.phase === b.phase &&
  a.startedAt === b.startedAt &&
  a.muted === b.muted &&
  a.locale === b.locale;

export function createCallActivity(native: CallActivityNative) {
  let handle: CallActivityHandle | undefined;
  let starting = false;
  let unavailable = false;
  let ended = false;
  let latest: CallActivityProps | undefined;
  let shown: CallActivityProps | undefined;

  const push = () => {
    if (handle === undefined || latest === undefined || ended) return;
    if (shown !== undefined && same(shown, latest)) return;
    shown = latest;
    void handle.update(latest).catch(() => undefined);
  };

  const end = () => {
    if (ended) return;
    ended = true;
    const current = handle;
    handle = undefined;
    if (current !== undefined) void current.end().catch(() => undefined);
  };

  return {
    sync(props: CallActivityProps | undefined) {
      if (ended) return;
      if (props === undefined) {
        if (handle !== undefined || starting) end();
        return;
      }
      latest = props;
      if (handle !== undefined) {
        push();
        return;
      }
      if (starting || unavailable) return;
      starting = true;
      void native
        .start(props)
        .catch(() => undefined)
        .then((started) => {
          starting = false;
          if (started === undefined) {
            unavailable = true;
            return;
          }
          if (ended) {
            void started.end().catch(() => undefined);
            return;
          }
          handle = started;
          shown = props;
          push();
        });
    },
    end,
  };
}
