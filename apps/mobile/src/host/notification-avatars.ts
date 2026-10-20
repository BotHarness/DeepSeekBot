import { avatarSvg } from '../../../../packages/core/src/bots/avatar-appearance';
import { resolvedAvatarRecipe } from '../../../../packages/core/src/bots/primary-color';
import type { RosterView } from './client';

export interface AvatarImage {
  uri: string;
  headers?: Record<string, string>;
}

export interface AvatarEntry {
  file: string;
  signature: string;
  image: AvatarImage;
}

export interface AvatarStore {
  read(host: string): Promise<Record<string, string>>;
  render(host: string, file: string, image: AvatarImage): Promise<void>;
  remove(host: string, file: string): void;
  write(host: string, index: Record<string, string>): void;
}

export const safeName = (value: string): string => value.replace(/[^A-Za-z0-9._-]/gu, '_');

export const avatarFile = (kind: 'bot' | 'channel', id: string): string =>
  `${safeName(`${kind}-${id}`)}.png`;

function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16)}:${String(text.length)}`;
}

function encode(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function avatarInputs(roster: RosterView): string {
  return JSON.stringify([
    roster.bots.map((bot) => [
      bot.slug,
      bot.displayName,
      bot.avatarUrl,
      bot.appearance,
      bot.avatarSeed,
    ]),
    roster.channels.map((channel) => [
      channel.id,
      channel.avatar === undefined ? undefined : fingerprint(channel.avatar),
    ]),
  ]);
}

export function notificationAvatars(roster: RosterView): AvatarEntry[] {
  const entries: AvatarEntry[] = [];
  for (const bot of roster.bots) {
    const file = avatarFile('bot', bot.slug);
    if (bot.avatarUrl !== undefined) {
      entries.push({
        file,
        signature: bot.avatarUrl,
        image: {
          uri: bot.avatarUrl,
          ...(bot.avatarHeaders === undefined ? {} : { headers: bot.avatarHeaders }),
        },
      });
      continue;
    }
    const recipe = resolvedAvatarRecipe({
      slug: bot.slug,
      displayName: bot.displayName,
      appearance: bot.appearance,
      avatarSeed: bot.avatarSeed,
    });
    if (recipe === undefined) continue;
    const svg = avatarSvg(recipe);
    entries.push({
      file,
      signature: `svg:${fingerprint(svg)}`,
      image: { uri: `data:image/svg+xml;base64,${encode(svg)}` },
    });
  }
  for (const channel of roster.channels) {
    if (channel.avatar === undefined) continue;
    entries.push({
      file: avatarFile('channel', channel.id),
      signature: fingerprint(channel.avatar),
      image: { uri: channel.avatar },
    });
  }
  return entries;
}

export function createNotificationAvatars(store: AvatarStore) {
  let running: Promise<boolean> | undefined;
  let next: { host: string; roster: RosterView } | undefined;

  const syncOnce = async (host: string, roster: RosterView): Promise<boolean> => {
    let complete = true;
    const stored = await store.read(host);
    const index: Record<string, string> = {};
    const wanted = notificationAvatars(roster);
    for (const entry of wanted) {
      if (stored[entry.file] === entry.signature) {
        index[entry.file] = entry.signature;
        continue;
      }
      try {
        await store.render(host, entry.file, entry.image);
        index[entry.file] = entry.signature;
      } catch {
        complete = false;
        store.remove(host, entry.file);
      }
    }
    const kept = new Set(wanted.map((entry) => entry.file));
    for (const file of Object.keys(stored)) if (!kept.has(file)) store.remove(host, file);
    store.write(host, index);
    return complete;
  };

  return {
    sync(host: string, roster: RosterView): Promise<boolean> {
      next = { host, roster };
      running ??= (async () => {
        let complete = true;
        try {
          while (next !== undefined) {
            const current = next;
            next = undefined;
            complete = await syncOnce(current.host, current.roster).catch(() => false);
          }
          return complete;
        } finally {
          running = undefined;
        }
      })();
      return running;
    },
  };
}
