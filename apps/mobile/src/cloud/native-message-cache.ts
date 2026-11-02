import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import {
  parseChannel,
  parseMessage,
  type CloudChannel,
  type CloudMessage,
} from './channel-contract';
const root = () => new Directory(Paths.cache, 'deepseekbot-cloud-messages');
const file = async (key: string) =>
  new File(
    root(),
    (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key)) + '.json',
  );
export async function readCloudMessages(key: string) {
  try {
    const f = await file(key);
    if (!f.exists) return undefined;
    const raw = JSON.parse(await f.text());
    if (
      !Array.isArray(raw.messages) ||
      raw.messages.length > 500 ||
      typeof raw.hasMore !== 'boolean'
    )
      return undefined;
    return {
      channel: parseChannel(raw.channel),
      messages: raw.messages.map(parseMessage),
      hasMore: raw.hasMore,
    };
  } catch {
    return undefined;
  }
}
export async function cacheCloudMessages(
  key: string,
  value: { channel: CloudChannel; messages: CloudMessage[]; hasMore: boolean },
) {
  try {
    root().create({ intermediates: true, idempotent: true });
    (await file(key)).writeSync(
      JSON.stringify({
        ...value,
        messages: value.messages.slice(0, 500),
        hasMore: value.hasMore || value.messages.length > 500,
      }),
    );
  } catch {}
}

export async function removeCloudMessages(key: string) {
  try {
    const f = await file(key);
    if (f.exists) f.delete();
  } catch {}
}
