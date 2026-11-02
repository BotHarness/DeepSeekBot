import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createHostClient } from '../src/host/client';
import { loadMemoryFile } from '../src/host/bot-profile';
import {
  loadPreviewImage,
  memoryPreviewSource,
  type MemoryPreviewIO,
} from '../src/host/memory-preview';
import type { MemoryMarkdown } from '../src/host/wire';
import { pairWithLiveHost } from './live-pairing';
import { nodeCarrier } from './node-carrier';

const live = process.env['MOBILE_LIVE_HOST_URL'];
const fixtureFile = process.env['MOBILE_MEMORY_FIXTURE'];
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe.skipIf(!live || !fixtureFile)(
  'mobile Memory reader with real isolated Host/device authentication',
  () => {
    it('reads current and historical local PNGs through the production adapter and refuses stale documents', async () => {
      const seed = JSON.parse(readFileSync(fixtureFile!, 'utf8')) as {
        slug: string;
        channelId: string;
        memory: string;
        commit: string;
        first: string;
      };
      const { route, operator, host } = await pairWithLiveHost(live!, 'Memory reader QA');
      const client = createHostClient({
        routes: host.routes,
        credential: host.credential,
        carrier: nodeCarrier(),
      });
      const exports: string[] = [];
      const port: MemoryPreviewIO = {
        fetch: (source, signal) =>
          fetch(source.uri, {
            headers: source.headers,
            signal,
            credentials: 'omit',
            redirect: 'error',
          }),
        store(bytes) {
          exports.push(hash(bytes));
          return { uri: 'file:///qa-export.png', dispose() {} };
        },
      };
      const signal = AbortSignal.timeout(15_000);
      const documentPath = resolve(seed.memory, 'notes/guide.md');
      const original = readFileSync(documentPath);
      try {
        const file = await loadMemoryFile(
          client,
          { slug: seed.slug, dmChannelId: seed.channelId },
          'notes/guide.md',
        );
        expect(file?.markdown?.status).toBe('ready');
        const document = file!.markdown!;
        expect(document.revision).toBe(hash(original));
        const png = await loadMemoryFile(
          client,
          { slug: seed.slug, dmChannelId: seed.channelId },
          'preview.png',
        );
        expect(png?.image?.status).toBe('ready');
        const current = readFileSync(resolve(seed.memory, 'preview.png'));
        await loadPreviewImage(
          port,
          memoryPreviewSource(client, seed.slug, 'preview.png', png!.image!),
          signal,
        );
        expect(exports.at(-1)).toBe(hash(current));
        for (const reference of ['../preview.png', '/preview.png']) {
          await loadPreviewImage(
            port,
            memoryPreviewSource(client, seed.slug, file!.path, document, reference),
            signal,
          );
          expect(exports.at(-1)).toBe(hash(current));
        }
        for (const source of [seed.first, seed.commit]) {
          const body = execFileSync('git', ['-C', seed.memory, 'show', `${source}:notes/guide.md`]);
          const image = execFileSync('git', ['-C', seed.memory, 'show', `${source}:preview.png`]);
          const version: MemoryMarkdown = {
            source,
            status: 'ready',
            revision: hash(body),
            body: body.toString('utf8'),
          };
          await loadPreviewImage(
            port,
            memoryPreviewSource(client, seed.slug, file!.path, version, '../preview.png'),
            signal,
          );
          expect(exports.at(-1)).toBe(hash(image));
        }
        const selected = memoryPreviewSource(
          client,
          seed.slug,
          file!.path,
          document,
          '../preview.png',
        );
        expect((await fetch(selected.uri)).status).toBe(401);
        await expect(
          loadPreviewImage(
            port,
            memoryPreviewSource(client, seed.slug, file!.path, document, '../../outside.png'),
            signal,
          ),
        ).rejects.toThrow('memory-image-invalid');
        await expect(
          loadPreviewImage(
            port,
            memoryPreviewSource(client, seed.slug, file!.path, document, '../missing.png'),
            signal,
          ),
        ).rejects.toThrow('memory-image-missing');
        writeFileSync(
          documentPath,
          Buffer.concat([original, Buffer.from('\nChanged after observation.\n')]),
        );
        await expect(loadPreviewImage(port, selected, signal)).rejects.toThrow(
          'memory-image-stale',
        );
        expect(exports).toHaveLength(5);
      } finally {
        writeFileSync(documentPath, original);
        client.stop();
        const response = await operator.request(`${route}/api/botharness/devices/revoke`, {
          method: 'POST',
          body: JSON.stringify({ deviceId: host.deviceId }),
          signal: AbortSignal.timeout(5000),
        });
        expect(response.status).toBe(200);
        const source = client.resource('/api/botharness/memory/image?slug=unused');
        expect((await fetch(source.uri, { headers: source.headers })).status).toBe(401);
      }
    }, 60_000);
  },
);
