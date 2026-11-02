import { inspectImage } from '../../../packages/core/src/media/image-format';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  loadPreviewImage,
  memoryPreviewSource,
  imageReferenceKind,
  MEMORY_IMAGE_LIMIT,
} from '../src/host/memory-preview';
import type { MemoryPreviewIO } from '../src/host/memory-preview';

const png = new Uint8Array(
  readFileSync(new URL('../assets/app-icons/deepseekbot-light.png', import.meta.url)),
);
const source = {
  uri: 'https://host.test/api/image',
  headers: { authorization: 'Bearer synthetic' },
};
function io(response: Response) {
  const dispose = vi.fn();
  const store = vi.fn(() => ({ uri: 'file:///synthetic.png', dispose }));
  return { fetch: vi.fn(async () => response), store, dispose };
}
describe('mobile Memory preview byte boundary', () => {
  it('retains source/version/reference and restricts credentials to Host resources', () => {
    const resource = vi.fn((path: string) => ({
      uri: 'https://host.test' + path,
      headers: source.headers,
    }));
    const client = { resource };
    const document = { source: 'index', revision: 'abc', status: 'ready' as const, body: '# Note' };
    const local = memoryPreviewSource(client, 'ada', 'notes/readme.md', document, '../pic.png');
    const url = new URL(local.uri);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      slug: 'ada',
      path: 'notes/readme.md',
      source: 'index',
      revision: 'abc',
      reference: '../pic.png',
    });
    expect(local.headers).toEqual(source.headers);
    const remote = memoryPreviewSource(
      client,
      'ada',
      'notes/readme.md',
      document,
      'https://images.test/pic.png',
    );
    expect(remote.headers).toEqual({});
    expect(resource).toHaveBeenCalledTimes(1);
    expect(() =>
      memoryPreviewSource(client, 'ada', 'x.md', document, 'file:///etc/passwd'),
    ).toThrow('memory-image-invalid');
    expect(() =>
      memoryPreviewSource(client, 'ada', 'x.md', { ...document, status: 'stale' }),
    ).toThrow('memory-image-stale');
  });
  it.each([
    'http://images.test/x.png',
    '//images.test/x.png',
    'data:image/png,x',
    'javascript:alert(1)',
    'https://user:pass@images.test/x.png',
    'x\\y',
    'x\u0000y',
  ])('rejects unsafe external reference %s', (reference) => {
    expect(imageReferenceKind(reference)).toBe('invalid');
  });
  it('checks real PNG dimensions and exports the identical bytes with cleanup', async () => {
    const port = io(new Response(png));
    const result = await loadPreviewImage(port, source, new AbortController().signal);
    expect(result).toMatchObject({
      width: inspectImage(png).width,
      height: inspectImage(png).height,
      uri: 'file:///synthetic.png',
      size: png.length,
    });
    expect(port.store).toHaveBeenCalledWith(png, 'png');
    result.dispose();
    expect(port.dispose).toHaveBeenCalledOnce();
  });
  it('refuses a stale document without storing bytes', async () => {
    const port = io(Response.json({ error: { code: 'memory-image-stale' } }, { status: 409 }));
    await expect(loadPreviewImage(port, source, new AbortController().signal)).rejects.toThrow(
      'memory-image-stale',
    );
    expect(port.store).not.toHaveBeenCalled();
  });
  it('bounds declared and streamed bytes and cancels the stream', async () => {
    const declared = io(
      new Response(png, { headers: { 'content-length': String(MEMORY_IMAGE_LIMIT + 1) } }),
    );
    await expect(loadPreviewImage(declared, source, new AbortController().signal)).rejects.toThrow(
      'memory-image-too-large',
    );
    const cancel = vi.fn();
    const streamed = io(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(MEMORY_IMAGE_LIMIT));
            controller.enqueue(new Uint8Array(1));
          },
          cancel,
        }),
      ),
    );
    await expect(loadPreviewImage(streamed, source, new AbortController().signal)).rejects.toThrow(
      'memory-image-too-large',
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(streamed.store).not.toHaveBeenCalled();
  });
  it('bounds failure bodies and rejects corrupt or oversized decoded metadata', async () => {
    const failure = io(new Response('x'.repeat(4097), { status: 500 }));
    await expect(loadPreviewImage(failure, source, new AbortController().signal)).rejects.toThrow(
      'memory-image-load-failed',
    );
    await expect(
      loadPreviewImage(io(new Response('<svg/>')), source, new AbortController().signal),
    ).rejects.toThrow('memory-image-unsupported');
    const large = png.slice();
    new DataView(large.buffer).setUint32(16, 16385);
    await expect(
      loadPreviewImage(io(new Response(large)), source, new AbortController().signal),
    ).rejects.toThrow('memory-image-too-large');
  });
  it('aborts an in-progress read without saving late bytes', async () => {
    const control = new AbortController();
    const cancel = vi.fn();
    const port = io(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(png.subarray(0, 20));
          },
          cancel,
        }),
      ),
    );
    const loading = loadPreviewImage(port, source, control.signal);
    await Promise.resolve();
    control.abort();
    await expect(loading).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
    expect(port.store).not.toHaveBeenCalled();
  });
  it('does not begin an already-cancelled request', async () => {
    const port: MemoryPreviewIO = io(new Response(png));
    const control = new AbortController();
    control.abort();
    await expect(loadPreviewImage(port, source, control.signal)).rejects.toThrow();
    expect(port.fetch).not.toHaveBeenCalled();
  });
});

it.each([
  ['jpg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['svg', 'image/svg+xml'],
])(
  'stores genuine %s original bytes with matching extension and sharing MIME',
  async (extension, mime) => {
    const original = readFileSync(
      new URL(
        `../../../packages/core/test/fixtures/memory-images/blue.${extension}`,
        import.meta.url,
      ),
    );
    const port = io(new Response(original, { headers: { 'content-type': mime } }));
    const result = await loadPreviewImage(port, source, new AbortController().signal);
    expect(result).toMatchObject({ width: 160, height: 90, mime, size: original.length });
    expect(port.store).toHaveBeenCalledWith(new Uint8Array(original), extension);
  },
);
it('never stores an unsafe or over-budget SVG for a native decoder', async () => {
  const unsafe = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  const port = io(new Response(unsafe, { headers: { 'content-type': 'image/svg+xml' } }));
  await expect(loadPreviewImage(port, source, new AbortController().signal)).rejects.toThrow(
    'memory-image-unsupported',
  );
  expect(port.store).not.toHaveBeenCalled();
  const huge = io(
    new Response('x', {
      headers: { 'content-type': 'image/svg+xml', 'content-length': String(1024 * 1024 + 1) },
    }),
  );
  await expect(loadPreviewImage(huge, source, new AbortController().signal)).rejects.toThrow(
    'memory-image-too-large',
  );
  expect(huge.store).not.toHaveBeenCalled();
});
