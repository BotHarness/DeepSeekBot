import { PushSendError, type ExpoReceipt, type ExpoSender, type ExpoTicket } from './delivery.js';

export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const TIMEOUT_MS = 15_000;

async function post(url: string, body: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'accept-encoding': 'gzip, deflate',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PushSendError('expo-unreachable', true);
  }
  if (response.status === 429 || response.status >= 500) {
    await response.body?.cancel();
    throw new PushSendError(`expo-${String(response.status)}`, true);
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new PushSendError(`expo-${String(response.status)}`, response.ok);
  }
  if (!response.ok) throw new PushSendError(`expo-${String(response.status)}`, false);
  return (value as { data?: unknown }).data;
}

export function createExpoSender(fetchImpl: typeof fetch = fetch): ExpoSender {
  return {
    async send(messages) {
      const data = await post(EXPO_PUSH_SEND_URL, messages, fetchImpl);
      if (!Array.isArray(data) || data.length !== messages.length)
        throw new PushSendError('expo-malformed', true);
      return data as ExpoTicket[];
    },
    async receipts(ids) {
      const data = await post(EXPO_PUSH_RECEIPTS_URL, { ids }, fetchImpl);
      return typeof data === 'object' && data !== null ? (data as Record<string, ExpoReceipt>) : {};
    },
  };
}
