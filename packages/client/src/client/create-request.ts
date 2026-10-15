export type CreateIntent = 'bot' | 'channel';

const EVENT = 'botharness/create';
let pending: CreateIntent | undefined;

export function requestCreation(intent: CreateIntent): void {
  pending = intent;
  document.dispatchEvent(new Event(EVENT));
}

export function onCreationRequest(listener: (intent: CreateIntent) => void): () => void {
  const deliver = (): void => {
    const intent = pending;
    pending = undefined;
    if (intent !== undefined) listener(intent);
  };
  document.addEventListener(EVENT, deliver);
  deliver();
  return () => document.removeEventListener(EVENT, deliver);
}
