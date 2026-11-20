import type { MessagingReadMode } from '../../../core/src/messaging/outbound.js';

export async function readSavedThenStatus<T extends { checks?: 'pending' | 'complete' }>(
  read: (mode: MessagingReadMode) => Promise<T>,
  publish: (value: T) => void,
): Promise<void> {
  const saved = await read('saved');
  publish(saved);
  if (saved.checks === 'pending') publish(await read('status'));
}
