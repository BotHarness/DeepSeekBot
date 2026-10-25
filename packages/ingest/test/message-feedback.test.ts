import { describe, expect, it } from 'vitest';
import { createFeedbackService, type FeedbackBucket } from '../src/feedback.js';

function fixture(index?: () => Promise<void>) {
  const objects = new Map<string, { data: ArrayBuffer; customMetadata: Record<string, string> }>();
  const bucket: FeedbackBucket = {
    async get(key) {
      const item = objects.get(key);
      return item ? { ...item, arrayBuffer: async () => item.data } : null;
    },
    async put(key, data, options) {
      if (options.onlyIf && objects.has(key)) return null;
      objects.set(key, { data, customMetadata: options.customMetadata });
      return {};
    },
    async delete(key) {
      objects.delete(key);
    },
    async list() {
      return { objects: [...objects.keys()].map((key) => ({ key })), truncated: false };
    },
  };
  let now = Date.parse('2026-10-26T00:00:00Z');
  const service = createFeedbackService({
    bucket,
    adminToken: 'test-maintainer-token-with-32-characters',
    now: () => now,
    ...(index ? { index } : {}),
  });
  return {
    service,
    objects,
    advance: () => {
      now += 31 * 86_400_000;
    },
  };
}
const id = 'e40f1aa1-4717-4626-809d-f07738798765';
function submission() {
  const form = new FormData();
  form.set(
    'metadata',
    JSON.stringify({
      rating: 'bad',
      tags: ['no-response'],
      comment: 'private comment',
      version: 'test',
    }),
  );
  form.set('archive', new Blob(['private diagnostic content']), 'evidence.zip');
  return new Request(`https://test/feedback/${id}`, { method: 'POST', body: form });
}
const admin = { authorization: 'Bearer test-maintainer-token-with-32-characters' };
describe('private feedback receiving interface', () => {
  it('keeps durable acceptance when the classification index is unavailable', async () => {
    const f = fixture(async () => {
      throw new Error('index offline');
    });
    expect((await f.service.fetch(submission())).status).toBe(201);
    expect((await f.service.fetch(submission())).status).toBe(200);
    expect(f.objects.size).toBe(1);
    const content = await f.service.fetch(
      new Request(`https://test/feedback/${id}/archive`, { headers: admin }),
    );
    expect(await content.text()).toBe('private diagnostic content');
  });
  it('atomically resolves simultaneous identical submissions and scheduled erasure', async () => {
    const f = fixture();
    const responses = await Promise.all([
      f.service.fetch(submission()),
      f.service.fetch(submission()),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(f.objects.size).toBe(1);
    f.advance();
    await f.service.expire();
    expect(f.objects.get(`reports/${id}`)?.data.byteLength).toBe(0);
    expect((await f.service.fetch(submission())).status).toBe(410);
  });
  it('refuses changed content and never exposes it in the public view shell', async () => {
    const f = fixture();
    await f.service.fetch(submission());
    const changed = await submission().formData();
    changed.set('archive', new Blob(['different content']), 'evidence.zip');
    expect(
      (
        await f.service.fetch(
          new Request(`https://test/feedback/${id}`, { method: 'POST', body: changed }),
        )
      ).status,
    ).toBe(409);
    const view = await f.service.fetch(new Request(`https://test/feedback/${id}/view`));
    expect(view.status).toBe(200);
    expect((await view.text()).includes('private comment')).toBe(false);
    expect(view.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
  it('durably accepts a report once, protects retrieval and expires the private content', async () => {
    const f = fixture();
    const first = await f.service.fetch(submission());
    expect(first.status).toBe(201);
    const receipt = await first.json();
    expect(receipt).toEqual({ reportId: id, expiresAt: '2026-11-25T00:00:00.000Z' });
    expect(await (await f.service.fetch(submission())).json()).toEqual(receipt);
    expect((await f.service.fetch(new Request(`https://test/feedback/${id}`))).status).toBe(401);
    const authorized = await f.service.fetch(
      new Request(`https://test/feedback/${id}`, { headers: admin }),
    );
    expect((await authorized.json()).feedback.comment).toBe('private comment');
    f.advance();
    expect(
      (await f.service.fetch(new Request(`https://test/feedback/${id}`, { headers: admin })))
        .status,
    ).toBe(410);
  });
  it('does not recreate withdrawn evidence on a late retry', async () => {
    const f = fixture();
    await f.service.fetch(submission());
    expect(
      (
        await f.service.fetch(
          new Request(`https://test/feedback/${id}`, { method: 'DELETE', headers: admin }),
        )
      ).status,
    ).toBe(200);
    expect((await f.service.fetch(submission())).status).toBe(410);
    expect(
      (
        await f.service.fetch(
          new Request(`https://test/feedback/${id}/archive`, { headers: admin }),
        )
      ).status,
    ).toBe(410);
  });
});
