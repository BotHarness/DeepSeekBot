import { IconMicrophoneOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type ReactElement,
  type RefCallback,
} from 'react';

import {
  createComposerDictation,
  dictationActive,
  DICTATION_HOLD_MS,
  DICTATION_HOLD_SLOP_PX,
  spliceDictation,
  type ComposerDictation,
  type ComposerDictationSnapshot,
  type DictationMic,
  type VoiceDictationPort,
} from './composer-dictation.js';
import { Tooltip } from './ds/tooltip.js';
import { useMountedResource } from './mounted-resource.js';
import { smoothLevel } from './voice-level.js';
import type { BotHarnessTranslate } from './locale.js';

const IDLE: ComposerDictationSnapshot = { status: 'idle', text: '', mode: undefined };
const noop = () => () => undefined;

export interface ComposerVoice {
  readonly mounts: readonly RefCallback<HTMLSpanElement>[];
  readonly ready: boolean;
  readonly snapshot: ComposerDictationSnapshot;
  readonly active: boolean;
  readonly outside: boolean;
  level(): number;
  start(mode: 'toggle' | 'hold'): void;
  stop(): void;
  cancel(): void;
  toggleMode(): void;
  readonly holdHandlers: {
    onPointerDown(event: PointerEvent<HTMLElement>): void;
    onContextMenu(event: { preventDefault(): void }): void;
  };
}

export function useComposerVoice({
  port,
  value,
  disabled,
  apply,
  selection,
  mic,
}: {
  port: VoiceDictationPort | undefined;
  value: string;
  disabled: boolean;
  apply(next: string, caret: number): void;
  selection?: (() => { start: number; end: number } | undefined) | undefined;
  mic?: DictationMic | undefined;
}): ComposerVoice {
  const [ready, setReady] = useState(false);
  const [outside, setOutside] = useState(false);
  const latest = useRef({ value, apply, disabled, selection });
  latest.current = { value, apply, disabled, selection };
  const base = useRef({ before: '', after: '' });
  const controller = useMemo<ComposerDictation | undefined>(
    () =>
      port === undefined
        ? undefined
        : createComposerDictation({
            port,
            ...(mic === undefined ? {} : { mic }),
            onText: (text) => {
              const next = spliceDictation(base.current.before, text, base.current.after);
              latest.current.apply(next.value, next.caret);
            },
          }),
    [port, mic],
  );
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? noop,
    controller?.snapshot ?? (() => IDLE),
    () => IDLE,
  );
  const active = dictationActive(snapshot.status);
  const settled =
    snapshot.status === 'denied' ||
    snapshot.status === 'missing' ||
    snapshot.status === 'failed' ||
    snapshot.status === 'limited';
  const start = (mode: 'toggle' | 'hold') => {
    if (controller === undefined || latest.current.disabled) return;
    const current = latest.current.value;
    const range = latest.current.selection?.();
    const from = Math.max(0, Math.min(range?.start ?? current.length, current.length));
    const to = Math.max(from, Math.min(range?.end ?? from, current.length));
    base.current = { before: current.slice(0, from), after: current.slice(to) };
    setOutside(false);
    controller.start(mode);
  };
  const stop = () => {
    setOutside(false);
    void controller?.stop();
  };
  const cancel = () => {
    if (controller === undefined || !dictationActive(controller.snapshot().status)) return;
    controller.cancel();
    const { before, after } = base.current;
    latest.current.apply(`${before}${after}`, before.length);
  };
  const readyMount = useMountedResource<HTMLSpanElement>(() => {
    setReady(false);
    if (port === undefined) return;
    let live = true;
    Promise.resolve()
      .then(() => port.readiness())
      .then((readiness) => {
        if (live) setReady(readiness.ready);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [port]);
  const controllerMount = useMountedResource<HTMLSpanElement>(
    () => () => controller?.dispose(),
    [controller],
  );
  const settleMount = useMountedResource<HTMLSpanElement>(() => {
    if (!settled || controller === undefined) return;
    const timer = setTimeout(() => controller.dismiss(), 6_000);
    return () => clearTimeout(timer);
  }, [settled, controller]);
  const holding = useRef<{ timer?: ReturnType<typeof setTimeout>; started: boolean }>({
    started: false,
  });
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (active) {
      if (snapshot.mode === 'toggle' && snapshot.status !== 'finishing') stop();
      return;
    }
    if (!ready || latest.current.disabled) return;
    const area = event.currentTarget;
    const x = event.clientX;
    const y = event.clientY;
    const gesture: { timer?: ReturnType<typeof setTimeout>; started: boolean } = {
      started: false,
    };
    holding.current = gesture;
    const finish = () => {
      clearTimeout(gesture.timer);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
    const move = (next: globalThis.PointerEvent) => {
      if (gesture.started) {
        const box = area.getBoundingClientRect();
        setOutside(
          next.clientX < box.left ||
            next.clientX > box.right ||
            next.clientY < box.top ||
            next.clientY > box.bottom,
        );
        return;
      }
      if (Math.hypot(next.clientX - x, next.clientY - y) > DICTATION_HOLD_SLOP_PX) finish();
    };
    const up = () => {
      finish();
      if (gesture.started) stop();
    };
    gesture.timer = setTimeout(() => {
      gesture.started = true;
      start('hold');
      window.getSelection()?.removeAllRanges();
    }, DICTATION_HOLD_MS);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  };
  return {
    mounts: [readyMount, controllerMount, settleMount],
    ready: ready && controller !== undefined,
    snapshot,
    active,
    outside: active && outside,
    level: () => controller?.level() ?? 0,
    start,
    stop,
    cancel,
    toggleMode: () => controller?.setMode('toggle'),
    holdHandlers: {
      onPointerDown,
      onContextMenu: (event) => {
        if (holding.current.started || active) event.preventDefault();
      },
    },
  };
}

export function composerVoiceStatus(
  voice: ComposerVoice,
  t: BotHarnessTranslate,
): string | undefined {
  const { status, mode } = voice.snapshot;
  if (status === 'starting') return t('composer.dictationStarting');
  if (status === 'listening' && mode === 'hold')
    return t(voice.outside ? 'composer.dictationHoldingOutside' : 'composer.dictationHolding');
  if (status === 'listening') return t('composer.dictationListening');
  if (status === 'finishing') return t('composer.dictationFinishing');
  if (status === 'limited') return t('composer.dictationLimit');
  if (status === 'denied') return t('composer.dictationDenied');
  if (status === 'missing') return t('composer.dictationMissing');
  if (status === 'failed') return t('composer.dictationFailed');
  return undefined;
}

export function composerVoicePlaceholder(
  voice: ComposerVoice,
  placeholder: string,
  holdPlaceholder: string | undefined,
  t: BotHarnessTranslate,
): string {
  return (
    composerVoiceStatus(voice, t) ??
    (voice.ready && holdPlaceholder !== undefined ? holdPlaceholder : placeholder)
  );
}

export function ComposerMicButton({
  voice,
  disabled,
  t,
}: {
  voice: ComposerVoice;
  disabled: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const press = useRef<{ at: number; startedHere: boolean } | undefined>(undefined);
  const recording = voice.active;
  const live = voice.snapshot.status === 'listening' || voice.snapshot.status === 'finishing';
  const readLevel = useRef(voice.level);
  readLevel.current = voice.level;
  const levelMount = useMountedResource<HTMLButtonElement>(
    (node) => {
      if (!live || typeof requestAnimationFrame !== 'function') return;
      let shown = 0;
      let frame = requestAnimationFrame(function tick() {
        shown = smoothLevel(shown, readLevel.current());
        node.style.setProperty('--bh-dictation-level', shown.toFixed(3));
        frame = requestAnimationFrame(tick);
      });
      return () => {
        cancelAnimationFrame(frame);
        node.style.removeProperty('--bh-dictation-level');
      };
    },
    [live],
  );
  const label = recording ? t('composer.stopDictation') : t('composer.dictate');
  return (
    <Tooltip
      label={
        recording
          ? label
          : voice.snapshot.status === 'idle'
            ? t('composer.dictateHint')
            : (composerVoiceStatus(voice, t) ?? t('composer.dictateHint'))
      }
      side="top"
      portal
      delayMs={350}
    >
      <button
        type="button"
        ref={levelMount}
        className="bh-composer-mic"
        data-state={live ? (voice.snapshot.mode ?? 'toggle') : recording ? 'starting' : 'idle'}
        aria-label={label}
        aria-pressed={live}
        disabled={disabled || voice.snapshot.status === 'finishing'}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const startedHere = !recording;
          press.current = { at: Date.now(), startedHere };
          if (!startedHere) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          voice.start('hold');
        }}
        onPointerUp={() => {
          const current = press.current;
          press.current = undefined;
          if (current === undefined) return;
          if (!current.startedHere) voice.stop();
          else if (Date.now() - current.at >= DICTATION_HOLD_MS) voice.stop();
          else voice.toggleMode();
        }}
        onPointerCancel={() => {
          if (press.current?.startedHere === true) voice.stop();
          press.current = undefined;
        }}
        onClick={(event) => {
          if (event.detail !== 0) return;
          if (recording) voice.stop();
          else voice.start('toggle');
        }}
      >
        <IconMicrophoneOutlineRegular size={16} />
      </button>
    </Tooltip>
  );
}
