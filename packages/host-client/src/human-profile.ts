import type { WireHumanAvatar, WireHumanIdentity } from '@botharness/host-protocol/wire';
import { HostAnswerInvalid, record, type HostCall } from './host-answer';

export type HumanIdentity = WireHumanIdentity;
export type HumanAvatarImage = WireHumanAvatar;

export const HUMAN_AVATAR_SIZE = 256;
export const HUMAN_AVATAR_BATCH = 64;

const VERSION = /^[a-f0-9]{16}$/u;
const AVATAR = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/u;

export function parseHumanIdentity(value: unknown, method = 'humanIdentity'): HumanIdentity {
  const item = record(value);
  const name = item?.['defaultDisplayName'];
  const version = item?.['avatarVersion'];
  const setup = item?.['profileSetup'];
  if (
    item === undefined ||
    typeof item['humanId'] !== 'string' ||
    item['humanId'].length === 0 ||
    (name !== null &&
      (typeof name !== 'string' || name.trim().length === 0 || name.length > 128)) ||
    typeof item['displayName'] !== 'string' ||
    item['displayName'].trim().length === 0 ||
    (version !== undefined && (typeof version !== 'string' || !VERSION.test(version))) ||
    (setup !== undefined && setup !== 'pending')
  )
    throw new HostAnswerInvalid(`${method} returned an invalid Human identity.`);
  return {
    humanId: item['humanId'],
    defaultDisplayName: name,
    displayName: item['displayName'],
    ...(typeof version === 'string' ? { avatarVersion: version } : {}),
    ...(item['profileSetup'] === 'pending' ? { profileSetup: 'pending' as const } : {}),
  };
}

export function parseHumanAvatars(value: unknown): HumanAvatarImage[] {
  const avatars = record(value)?.['avatars'];
  if (!Array.isArray(avatars)) throw new HostAnswerInvalid('humanAvatars returned no list.');
  return avatars.map((raw: unknown) => {
    const item = record(raw);
    if (
      typeof item?.['humanId'] !== 'string' ||
      !item['humanId'] ||
      typeof item['version'] !== 'string' ||
      !VERSION.test(item['version']) ||
      typeof item['avatar'] !== 'string' ||
      !AVATAR.test(item['avatar'])
    )
      throw new HostAnswerInvalid('humanAvatars returned an invalid avatar.');
    return { humanId: item['humanId'], version: item['version'], avatar: item['avatar'] };
  });
}

export async function readHumanIdentity(host: HostCall): Promise<HumanIdentity> {
  return parseHumanIdentity(await host.call('humanIdentity', {}));
}

export async function setHumanName(
  host: HostCall,
  displayName: string | null,
): Promise<HumanIdentity> {
  return parseHumanIdentity(await host.call('humanNameSet', { displayName }), 'humanNameSet');
}

export async function setHumanAvatar(
  host: HostCall,
  avatar: string | null,
): Promise<HumanIdentity> {
  return parseHumanIdentity(await host.call('humanAvatarSet', { avatar }), 'humanAvatarSet');
}

export async function finishHumanProfile(host: HostCall): Promise<HumanIdentity> {
  return parseHumanIdentity(
    await host.call('humanProfileSetupFinish', {}),
    'humanProfileSetupFinish',
  );
}

export async function readHumanAvatars(
  host: HostCall,
  humanIds: string[],
): Promise<HumanAvatarImage[]> {
  return parseHumanAvatars(await host.call('humanAvatars', { humanIds }));
}

export function humanAvatarVersionOf(value: unknown): { avatarVersion?: string } {
  return typeof value === 'string' && VERSION.test(value) ? { avatarVersion: value } : {};
}

export interface HumanAvatarCache {
  get(humanId: string, version: string | undefined): string | undefined;
  want(humanId: string, version: string | undefined): void;
  put(image: HumanAvatarImage): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): number;
}

const HUMAN_AVATAR_RETRY_MS = 30_000;

export function createHumanAvatarCache(
  load: (humanIds: string[]) => Promise<readonly HumanAvatarImage[]>,
  schedule: (run: () => void) => void = (run) => void Promise.resolve().then(run),
): HumanAvatarCache {
  const images = new Map<string, string>();
  const settled = new Set<string>();
  const loading = new Set<string>();
  const missed = new Map<string, number>();
  const retrying = new Set<string>();
  const queued = new Map<string, string>();
  const listeners = new Set<() => void>();
  let revision = 0;
  let scheduled = false;
  const key = (humanId: string, version: string) => `${humanId}\u0000${version}`;
  const publish = (): void => {
    revision += 1;
    for (const listener of listeners) listener();
  };
  const flush = (): void => {
    scheduled = false;
    const batch = [...queued].slice(0, HUMAN_AVATAR_BATCH);
    for (const [humanId] of batch) queued.delete(humanId);
    if (queued.size > 0) {
      scheduled = true;
      schedule(flush);
    }
    if (batch.length === 0) return;
    for (const [humanId, version] of batch) loading.add(key(humanId, version));
    const release = (): void => {
      for (const [humanId, version] of batch) loading.delete(key(humanId, version));
    };
    void load(batch.map(([humanId]) => humanId))
      .then((received) => {
        for (const image of received) {
          images.set(key(image.humanId, image.version), image.avatar);
          settled.add(key(image.humanId, image.version));
        }
        release();
        for (const [humanId, version] of batch) {
          const requested = key(humanId, version);
          if (!settled.has(requested)) missed.set(requested, Date.now());
        }
        publish();
      })
      .catch(release);
  };
  const cache: HumanAvatarCache = {
    get: (humanId, version) =>
      version === undefined ? undefined : images.get(key(humanId, version)),
    want(humanId, version) {
      if (version === undefined) return;
      const wanted = key(humanId, version);
      if (settled.has(wanted) || loading.has(wanted) || queued.get(humanId) === version) return;
      const wait = (missed.get(wanted) ?? -Infinity) + HUMAN_AVATAR_RETRY_MS - Date.now();
      if (wait > 0) {
        if (!retrying.has(wanted)) {
          retrying.add(wanted);
          setTimeout(() => {
            retrying.delete(wanted);
            cache.want(humanId, version);
          }, wait);
        }
        return;
      }
      queued.set(humanId, version);
      if (!scheduled) {
        scheduled = true;
        schedule(flush);
      }
    },
    put(image) {
      images.set(key(image.humanId, image.version), image.avatar);
      settled.add(key(image.humanId, image.version));
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => revision,
  };
  return cache;
}
