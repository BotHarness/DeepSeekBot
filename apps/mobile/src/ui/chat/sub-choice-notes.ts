export interface NoteQueue {
  commit(text: string, saved: string): boolean;
  settled(): Promise<void>;
}

export function noteQueue(
  write: (text: string) => Promise<void>,
  onSaved: (text: string) => void,
  onError: (cause: unknown, text: string) => void,
): NoteQueue {
  let chain = Promise.resolve();
  let queued: string | undefined;
  return {
    commit(text, saved) {
      if (text === (queued ?? saved)) return false;
      queued = text;
      chain = chain.then(() =>
        write(text).then(
          () => onSaved(text),
          (cause: unknown) => {
            if (queued === text) queued = undefined;
            onError(cause, text);
          },
        ),
      );
      return true;
    },
    settled: () => chain,
  };
}

export interface FailedNote {
  text: string;
  error: string;
}

const failedNotes = new Map<string, FailedNote>();

export function failedNote(key: string): FailedNote | undefined {
  return failedNotes.get(key);
}

export function rememberFailedNote(key: string, note: FailedNote): void {
  failedNotes.set(key, note);
}

export function forgetFailedNote(key: string): void {
  failedNotes.delete(key);
}

export interface NoteHandlers {
  write(text: string): Promise<void>;
  onSaved(text: string): void;
  onError(cause: unknown, text: string): void;
}

const sharedQueues = new Map<string, { queue: NoteQueue; handlers: NoteHandlers }>();

export function sharedNoteQueue(key: string, handlers: NoteHandlers): NoteQueue {
  const entry = sharedQueues.get(key);
  if (entry !== undefined) {
    Object.assign(entry.handlers, handlers);
    return entry.queue;
  }
  const current = { ...handlers };
  const queue = noteQueue(
    (text) => current.write(text),
    (text) => current.onSaved(text),
    (cause, text) => current.onError(cause, text),
  );
  sharedQueues.set(key, { queue, handlers: current });
  return queue;
}
