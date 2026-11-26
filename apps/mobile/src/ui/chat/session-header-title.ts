import type { SessionTranscript } from '@botharness/host-client/session-detail';

export type SessionHeaderTitle = { text: string; pending: boolean };

export function promptPlaceholder(prompt: string): string {
  return (
    prompt
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '')
      ?.slice(0, 80) ?? ''
  );
}

export function sessionHeaderTitle({
  resolved,
  placeholder,
  fresh,
  transcript,
  fallback,
}: {
  resolved: string | undefined;
  placeholder: string | undefined;
  fresh: boolean;
  transcript: Pick<SessionTranscript, 'titleFallback' | 'running' | 'items'> | undefined;
  fallback: string;
}): SessionHeaderTitle {
  const waiting =
    fresh &&
    (transcript === undefined ||
      (transcript.titleFallback === true &&
        (transcript.running || !transcript.items.some((item) => item.kind === 'reply'))));
  if (waiting) return { text: placeholder || fallback, pending: true };
  return { text: resolved || placeholder || fallback, pending: false };
}

export function titleMorphKey(title: string, pending: boolean): number {
  let hash = pending ? 1 : 0;
  for (let index = 0; index < title.length; index += 1)
    hash = (Math.imul(hash, 31) + title.charCodeAt(index)) | 0;
  return hash;
}

type MorphEntry = { title: string; pending: boolean };
export type MorphTitleSlots = { entries: readonly [MorphEntry, MorphEntry]; active: 0 | 1 };

export function morphTitleSlots(
  slots: MorphTitleSlots | undefined,
  title: string,
  pending: boolean,
): MorphTitleSlots {
  if (slots === undefined)
    return {
      entries: [
        { title, pending },
        { title: '', pending: false },
      ],
      active: 0,
    };
  const shown = slots.entries[slots.active];
  if (shown.title === title && shown.pending === pending) return slots;
  const active = slots.active === 0 ? 1 : 0;
  const entries: [MorphEntry, MorphEntry] = [slots.entries[0], slots.entries[1]];
  entries[active] = { title, pending };
  return { entries, active };
}
