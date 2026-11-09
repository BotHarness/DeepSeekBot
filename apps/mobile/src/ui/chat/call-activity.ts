import { callStrings } from '../strings';
import type { CallActivityPhase, CallBubbleTone } from './call-model';

export type CallActivityPalette = {
  success: string;
  accent: string;
  warning: string;
  danger: string;
  muted: string;
  surface: string;
  fg: string;
  base: string;
};

export type CallActivityProps = {
  name: string;
  phase: CallActivityPhase;
  startedAt: number;
  muted: boolean;
  locale: 'en' | 'zh';
  palette?: CallActivityPalette | undefined;
  avatar?: string | undefined;
  avatarColor?: string | undefined;
  avatarInk?: string | undefined;
  badge?: string | undefined;
  badgeDark?: string | undefined;
};

export function callToneColor(color: CallActivityPalette, tone: CallBubbleTone): string {
  switch (tone) {
    case 'listening':
    case 'hearing':
      return color.success;
    case 'thinking':
    case 'speaking':
      return color.accent;
    case 'paused':
      return color.warning;
    case 'ended':
      return color.danger;
    default:
      return color.muted;
  }
}

export function callActivityTone(phase: CallActivityPhase): Exclude<CallBubbleTone, 'ended'> {
  if (phase === 'connecting' || phase === 'reconnecting') return 'connecting';
  if (phase === 'interrupted') return 'paused';
  return phase;
}

export function callNotice(props: CallActivityProps, palette: CallActivityPalette) {
  const t = callStrings[props.locale];
  const tone = callActivityTone(props.phase);
  const status = {
    connecting: t.connecting,
    listening: t.listening,
    hearing: t.hearing,
    thinking: t.thinking,
    speaking: t.speaking,
    muted: t.muted,
    interrupted: t.paused,
    reconnecting: t.reconnecting,
  }[props.phase];
  return {
    name: props.name,
    status,
    tone,
    startedAt: props.phase === 'connecting' ? 0 : props.startedAt,
    muted: props.muted,
    muteLabel: t.mute,
    unmuteLabel: t.unmute,
    hangUpLabel: t.hangUp,
    channelName: t.noticeChannel,
    bubbleLabel: t.bubble(props.name, status, undefined),
    ringColor: callToneColor(palette, tone),
    surfaceColor: palette.surface,
    fgColor: palette.fg,
    baseColor: palette.base,
  };
}

export interface CallActivityHandle {
  update(props: CallActivityProps): Promise<void>;
  end(): Promise<void>;
}

export type CallActivityAction = 'hang-up' | 'mute' | 'open';

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
  a.locale === b.locale &&
  a.avatar === b.avatar &&
  a.avatarColor === b.avatarColor &&
  a.avatarInk === b.avatarInk &&
  a.badge === b.badge &&
  a.badgeDark === b.badgeDark &&
  samePalette(a.palette, b.palette);

const samePalette = (a: CallActivityPalette | undefined, b: CallActivityPalette | undefined) =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    (Object.keys(a) as (keyof CallActivityPalette)[]).every((key) => a[key] === b[key]));

export function createCallActivity(native: CallActivityNative) {
  let handle: CallActivityHandle | undefined;
  let starting = false;
  let unavailable = false;
  let ended = false;
  let latest: CallActivityProps | undefined;
  let shown: CallActivityProps | undefined;
  let updating = false;

  const push = () => {
    if (handle === undefined || latest === undefined || ended || updating) return;
    if (shown !== undefined && same(shown, latest)) return;
    const next = latest;
    shown = next;
    updating = true;
    void handle
      .update(next)
      .catch(() => undefined)
      .then(() => {
        updating = false;
        push();
      });
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
