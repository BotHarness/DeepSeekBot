import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ATTACHMENT_FILE_ID_PATTERN } from './ref.js';
import type { AttachmentStore } from './store.js';
import type { ImageProcessor, ThumbnailVariant } from './thumbnails.js';

export const MEDIA_DIRECTORY = 'media';

export interface MediaFacts {
  version: string;
  width?: number;
  height?: number;
  thumbhash?: string;
}

interface Sidecar extends MediaFacts {
  size: number;
  mtimeMs: number;
}

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export interface MediaVersions {
  describe(fileId: string): MediaFacts | undefined;
  ensure(fileId: string): Promise<MediaFacts | undefined>;
  thumbnail(
    fileId: string,
    version: string,
    variant: ThumbnailVariant,
  ): Promise<{ bytes: Buffer } | 'stale' | 'unavailable'>;
}

export function createMediaVersions(
  store: Pick<AttachmentStore, 'fileTarget' | 'contentVersion' | 'current' | 'maxBytes'>,
  processor: () => Promise<ImageProcessor | undefined>,
  changed?: (fileId: string) => void,
): MediaVersions {
  const pending = new Map<string, Promise<MediaFacts | undefined>>();
  const located = (fileId: string) => {
    if (!ATTACHMENT_FILE_ID_PATTERN.test(fileId)) return undefined;
    try {
      const { path } = store.fileTarget(fileId);
      const stat = lstatSync(path);
      return { path, root: join(dirname(dirname(path)), MEDIA_DIRECTORY), stat };
    } catch {
      return undefined;
    }
  };
  const read = (root: string): Sidecar | undefined => {
    try {
      const value = JSON.parse(readFileSync(join(root, 'facts.json'), 'utf8')) as Sidecar;
      return typeof value.version === 'string' ? value : undefined;
    } catch {
      return undefined;
    }
  };
  const fresh = (fileId: string) => {
    const file = located(fileId);
    if (file === undefined) return undefined;
    const sidecar = read(file.root);
    const current =
      sidecar !== undefined &&
      sidecar.size === file.stat.size &&
      sidecar.mtimeMs === file.stat.mtimeMs;
    return { file, sidecar: current ? sidecar : undefined };
  };
  const compute = async (fileId: string): Promise<MediaFacts | undefined> => {
    const state = fresh(fileId);
    if (state === undefined) return undefined;
    if (state.sidecar !== undefined) return publicFacts(state.sidecar);
    const { file } = state;
    let digest: string;
    try {
      digest = store.contentVersion({ fileId, name: '', mime: '', size: 0 });
    } catch {
      return undefined;
    }
    const facts: Sidecar = {
      version: digest.slice(0, 32),
      size: file.stat.size,
      mtimeMs: file.stat.mtimeMs,
    };
    const ref = (() => {
      try {
        return store.current({ fileId, name: '', mime: '', size: 0 });
      } catch {
        return undefined;
      }
    })();
    if (ref !== undefined && IMAGE_MIMES.has(ref.mime)) {
      const image = await processor();
      const measured = image === undefined ? undefined : await image.facts(readFileSync(file.path));
      if (measured !== undefined) Object.assign(facts, measured);
    }
    const after = located(fileId);
    if (
      after === undefined ||
      after.stat.size !== facts.size ||
      after.stat.mtimeMs !== facts.mtimeMs
    )
      return undefined;
    mkdirSync(file.root, { recursive: true });
    const temp = join(file.root, `facts.${process.pid}.${Date.now()}.tmp`);
    writeFileSync(temp, JSON.stringify(facts));
    renameSync(temp, join(file.root, 'facts.json'));
    changed?.(fileId);
    return publicFacts(facts);
  };
  const ensure = (fileId: string): Promise<MediaFacts | undefined> => {
    const running = pending.get(fileId);
    if (running !== undefined) return running;
    const operation = compute(fileId).finally(() => pending.delete(fileId));
    pending.set(fileId, operation);
    return operation;
  };
  return {
    describe(fileId) {
      const state = fresh(fileId);
      if (state === undefined) return undefined;
      if (state.sidecar !== undefined) return publicFacts(state.sidecar);
      void ensure(fileId).catch(() => undefined);
      return undefined;
    },
    ensure,
    async thumbnail(fileId, version, variant) {
      const facts = await ensure(fileId);
      if (facts === undefined) return 'unavailable';
      if (facts.version !== version) return 'stale';
      const file = located(fileId);
      if (file === undefined) return 'unavailable';
      const path = join(file.root, `${version}-${variant}.webp`);
      if (existsSync(path)) return { bytes: readFileSync(path) };
      const image = await processor();
      if (image === undefined || file.stat.size > store.maxBytes) return 'unavailable';
      const bytes = await image.thumbnail(readFileSync(file.path), variant);
      if (bytes === undefined) return 'unavailable';
      if ((await ensure(fileId))?.version !== version) return 'stale';
      mkdirSync(file.root, { recursive: true });
      const temp = `${path}.${process.pid}.tmp`;
      writeFileSync(temp, bytes);
      renameSync(temp, path);
      return { bytes };
    },
  };
}

function publicFacts(sidecar: Sidecar): MediaFacts {
  return {
    version: sidecar.version,
    ...(sidecar.width === undefined ? {} : { width: sidecar.width }),
    ...(sidecar.height === undefined ? {} : { height: sidecar.height }),
    ...(sidecar.thumbhash === undefined ? {} : { thumbhash: sidecar.thumbhash }),
  };
}
