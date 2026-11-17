export interface HumanIdentity {
  humanId: string;
  defaultDisplayName: string | null;
  displayName: string;
  avatarVersion?: string;
}

export interface HumanAvatarImage {
  humanId: string;
  version: string;
  avatar: string;
}

export const HUMAN_AVATAR_SIZE = 256;
export const HUMAN_AVATAR_BATCH = 64;

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const VERSION = /^[a-f0-9]{16}$/u;
const AVATAR = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/u;

export function parseHumanIdentity(value: unknown): HumanIdentity {
  const item = record(value);
  const name = item?.['defaultDisplayName'];
  const version = item?.['avatarVersion'];
  if (
    item === undefined ||
    typeof item['humanId'] !== 'string' ||
    item['humanId'].length === 0 ||
    (name !== null &&
      (typeof name !== 'string' || name.trim().length === 0 || name.length > 128)) ||
    typeof item['displayName'] !== 'string' ||
    item['displayName'].trim().length === 0 ||
    (version !== undefined && (typeof version !== 'string' || !VERSION.test(version)))
  )
    throw new Error('invalid Human identity');
  return {
    humanId: item['humanId'],
    defaultDisplayName: name,
    displayName: item['displayName'],
    ...(typeof version === 'string' ? { avatarVersion: version } : {}),
  };
}

export function parseHumanAvatars(value: unknown): HumanAvatarImage[] {
  const avatars = record(value)?.['avatars'];
  if (!Array.isArray(avatars)) throw new Error('invalid humanAvatars response');
  return avatars.flatMap((raw: unknown) => {
    const item = record(raw);
    return typeof item?.['humanId'] === 'string' &&
      typeof item['version'] === 'string' &&
      VERSION.test(item['version']) &&
      typeof item['avatar'] === 'string' &&
      AVATAR.test(item['avatar'])
      ? [{ humanId: item['humanId'], version: item['version'], avatar: item['avatar'] }]
      : [];
  });
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

export function createHumanAvatarCache(
  load: (humanIds: string[]) => Promise<unknown>,
  schedule: (run: () => void) => void = (run) => void Promise.resolve().then(run),
): HumanAvatarCache {
  const images = new Map<string, string>();
  const settled = new Set<string>();
  const loading = new Set<string>();
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
      .then((value) => {
        const received = parseHumanAvatars(value);
        const answered = new Set<string>();
        for (const image of received) {
          images.set(key(image.humanId, image.version), image.avatar);
          settled.add(key(image.humanId, image.version));
          answered.add(image.humanId);
        }
        release();
        for (const [humanId, version] of batch)
          if (!answered.has(humanId)) settled.add(key(humanId, version));
        publish();
      })
      .catch(release);
  };
  return {
    get: (humanId, version) =>
      version === undefined ? undefined : images.get(key(humanId, version)),
    want(humanId, version) {
      if (version === undefined) return;
      const wanted = key(humanId, version);
      if (settled.has(wanted) || loading.has(wanted) || queued.get(humanId) === version) return;
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
}

export function parseChannelNickname(value: unknown): string | null {
  const nickname = record(record(value)?.['channel'])?.['humanNickname'];
  if (nickname === undefined || nickname === null) return null;
  if (typeof nickname !== 'string') throw new Error('invalid Channel nickname');
  return nickname;
}
