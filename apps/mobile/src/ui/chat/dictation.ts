export type DictationStatus =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'denied'
  | 'unavailable'
  | 'failed';

export interface Dictation {
  status: DictationStatus;
  heard: string;
}

export type DictationEvent =
  | { kind: 'press' }
  | { kind: 'refused'; reason: 'denied' | 'unavailable' }
  | { kind: 'started' }
  | { kind: 'heard'; transcript: string }
  | { kind: 'error'; code: string }
  | { kind: 'ended' }
  | { kind: 'cancel' };

export const idleDictation: Dictation = { status: 'idle', heard: '' };

export function dictating(status: DictationStatus): boolean {
  return status === 'starting' || status === 'listening';
}

function errorStatus(code: string): DictationStatus {
  if (code === 'not-allowed') return 'denied';
  if (code === 'service-not-allowed' || code === 'language-not-supported') return 'unavailable';
  if (code === 'aborted' || code === 'no-speech' || code === 'speech-timeout') return 'idle';
  return 'failed';
}

export function dictate(state: Dictation, event: DictationEvent): Dictation {
  switch (event.kind) {
    case 'press':
      return dictating(state.status) ? state : { status: 'starting', heard: '' };
    case 'refused':
      return dictating(state.status) ? { status: event.reason, heard: '' } : state;
    case 'started':
      return state.status === 'starting' ? { ...state, status: 'listening' } : state;
    case 'heard':
      return dictating(state.status)
        ? { status: 'listening', heard: event.transcript.trim() }
        : state;
    case 'error':
      return dictating(state.status) ? { ...state, status: errorStatus(event.code) } : state;
    case 'ended':
      return dictating(state.status) ? { ...state, status: 'idle' } : state;
    case 'cancel':
      return idleDictation;
  }
}

export type ComposerAction = 'mic' | 'send' | 'stop';

export function composerActions(input: {
  text: string;
  files: number;
  disabled: boolean;
  dictation: DictationStatus;
  canDictate: boolean;
}): ComposerAction[] {
  if (dictating(input.dictation)) return ['stop'];
  const empty = input.text.trim() === '';
  return [
    ...(empty && input.canDictate && !input.disabled ? (['mic'] as const) : []),
    ...((!empty || input.files > 0) && !input.disabled ? (['send'] as const) : []),
  ];
}

export function composerStacked(actions: ComposerAction[], files: number, wraps: boolean): boolean {
  return wraps || files > 0 || actions.length > 1;
}

export const voiceGesture = { holdMs: 300, cancelDrag: 80, lockDrag: 60 } as const;

export function voiceDrag(dx: number, dy: number): 'cancel' | 'lock' | undefined {
  if (dx <= -voiceGesture.cancelDrag) return 'cancel';
  if (dy <= -voiceGesture.lockDrag) return 'lock';
  return undefined;
}

export function voiceRelease(heldMs: number): 'stop' | 'lock' {
  return heldMs >= voiceGesture.holdMs ? 'stop' : 'lock';
}

export function speechLang(tag: string): string {
  const parts = tag.split(/[-_]/u).filter((part) => part !== '');
  const language = parts[0]?.toLowerCase() ?? 'en';
  const region = parts.slice(1).find((part) => /^(?:[a-z]{2}|\d{3})$/iu.test(part));
  if (region !== undefined) return `${language}-${region.toUpperCase()}`;
  return language === 'zh' ? 'zh-CN' : language === 'en' ? 'en-US' : language;
}
