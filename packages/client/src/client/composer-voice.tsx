import {
  IconMicrophoneOutlineRegular,
  IconStopFillRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
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
  withDictation,
  type ComposerDictation,
  type ComposerDictationSnapshot,
  type DictationMic,
  type VoiceDictationPort,
} from './composer-dictation.js';
import { Tooltip } from './ds/tooltip.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotHarnessTranslate } from './locale.js';

const IDLE: ComposerDictationSnapshot = { status: 'idle', text: '', mode: undefined };
const noop = () => () => undefined;

export interface ComposerVoice {
  readonly mounts: readonly RefCallback<HTMLSpanElement>[];
  readonly ready: boolean;
  readonly snapshot: ComposerDictationSnapshot;
  readonly active: boolean;
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
  mic,
}: {
  port: VoiceDictationPort | undefined;
  value: string;
  disabled: boolean;
  apply(next: string): void;
  mic?: DictationMic | undefined;
}): ComposerVoice {
  const [ready, setReady] = useState(false);
  const latest = useRef({ value, apply, disabled });
  latest.current = { value, apply, disabled };
  const base = useRef('');
  const controller = useMemo<ComposerDictation | undefined>(
    () =>
      port === undefined
        ? undefined
        : createComposerDictation({
            port,
            ...(mic === undefined ? {} : { mic }),
            onText: (text) => latest.current.apply(withDictation(base.current, text)),
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
    snapshot.status === 'denied' || snapshot.status === 'missing' || snapshot.status === 'failed';
  const start = (mode: 'toggle' | 'hold') => {
    if (controller === undefined || latest.current.disabled) return;
    base.current = latest.current.value;
    controller.start(mode);
  };
  const stop = () => void controller?.stop();
  const cancelRef = useRef(() => undefined as void);
  const cancel = () => {
    if (controller === undefined || !dictationActive(controller.snapshot().status)) return;
    controller.cancel();
    latest.current.apply(base.current);
  };
  cancelRef.current = cancel;
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
  const escapeMount = useMountedResource<HTMLSpanElement>(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cancelRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);
  const holding = useRef<{ timer?: ReturnType<typeof setTimeout>; started: boolean }>({
    started: false,
  });
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!ready || active || event.button !== 0 || latest.current.disabled) return;
    if (latest.current.value.trim() !== '') return;
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
      if (gesture.started) return;
      if (Math.hypot(next.clientX - x, next.clientY - y) > DICTATION_HOLD_SLOP_PX) finish();
    };
    const up = () => {
      finish();
      if (gesture.started) stop();
    };
    gesture.timer = setTimeout(() => {
      gesture.started = true;
      window.getSelection()?.removeAllRanges();
      start('hold');
    }, DICTATION_HOLD_MS);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  };
  return {
    mounts: [readyMount, controllerMount, settleMount, escapeMount],
    ready: ready && controller !== undefined,
    snapshot,
    active,
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

export function composerVoicePlaceholder(
  voice: ComposerVoice,
  placeholder: string,
  holdPlaceholder: string | undefined,
  t: BotHarnessTranslate,
): string {
  const { status, mode } = voice.snapshot;
  if (status === 'starting') return t('composer.dictationStarting');
  if (status === 'listening')
    return t(mode === 'hold' ? 'composer.dictationHolding' : 'composer.dictationListening');
  if (status === 'finishing') return t('composer.dictationFinishing');
  if (status === 'denied') return t('composer.dictationDenied');
  if (status === 'missing') return t('composer.dictationMissing');
  if (status === 'failed') return t('composer.dictationFailed');
  return voice.ready && holdPlaceholder !== undefined ? holdPlaceholder : placeholder;
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
  const label = recording ? t('composer.stopDictation') : t('composer.dictate');
  return (
    <Tooltip label={recording ? label : t('composer.dictateHint')} side="top" portal delayMs={350}>
      <button
        type="button"
        className="bh-composer-mic"
        data-state={recording ? (voice.snapshot.mode ?? 'toggle') : 'idle'}
        aria-label={label}
        aria-pressed={recording}
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
        {recording ? <IconStopFillRegular size={12} /> : <IconMicrophoneOutlineRegular size={16} />}
      </button>
    </Tooltip>
  );
}
