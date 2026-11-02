import { inspectImage } from '../media/image-format.js';
import { MemoryAcceptError } from './accepted.js';
import { MemoryImageError } from './image.js';
import { MemoryPathError } from './jail.js';
import type { MemoryService } from './service.js';

export const MEMORY_IMAGE_PATH = '/api/botharness/memory/image';
export function createMemoryImageHttp(
  memory: MemoryService,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'GET')
      return new Response(null, { status: 405, headers: { allow: 'GET' } });
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug'),
      path = url.searchParams.get('path');
    const source = url.searchParams.get('source'),
      revision = url.searchParams.get('revision');
    if (!slug || !path || !source || !revision)
      return Response.json(
        {
          error: {
            code: 'memory-image-invalid',
            message: 'slug, path, source and revision are required',
          },
        },
        { status: 400 },
      );
    try {
      request.signal.throwIfAborted();
      const reference = url.searchParams.get('reference');
      const bytes =
        reference === null
          ? memory.imageFile(slug, path, source, revision)
          : memory.markdownImageFile(slug, path, source, revision, reference);
      return new Response(new Uint8Array(bytes), {
        headers: {
          'content-type': inspectImage(bytes).mime,
          'cross-origin-resource-policy': 'same-origin',
          'content-length': String(bytes.length),
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
      });
    } catch (error) {
      if (
        !(
          error instanceof MemoryImageError ||
          error instanceof MemoryAcceptError ||
          error instanceof MemoryPathError
        )
      )
        throw error;
      const code = error instanceof MemoryPathError ? 'memory-image-invalid' : error.code;
      return Response.json(
        { error: { code, message: error.message } },
        {
          status: code === 'memory-image-stale' ? 409 : code === 'memory-image-missing' ? 404 : 400,
          headers: { 'cache-control': 'no-store' },
        },
      );
    }
  };
}
