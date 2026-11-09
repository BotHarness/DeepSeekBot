import {
  dictationActive,
  type ComposerDictationStatus,
} from '../../../../../packages/core/src/voice/dictation-client';

export type DictationStatus = ComposerDictationStatus;

export const dictating = dictationActive;

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
    ...(!empty || input.files > 0 ? (['send'] as const) : []),
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

export const composerMaxLines = 5;

export function composerFieldHeight(
  content: number,
  line: number,
  padding: number,
  available = Infinity,
): number {
  const minimum = line + 2 * padding;
  return Math.min(
    Math.max(content, minimum),
    Math.max(minimum, Math.min(available, composerMaxLines * line + 2 * padding)),
  );
}
