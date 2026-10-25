import { z } from 'zod';
import type { MessageFeedbackOptions } from './message-feedback-http.js';

const receiptSchema = z.object({ reportId: z.string().uuid(), expiresAt: z.iso.datetime() });

export function feedbackUploader(endpoint: string): NonNullable<MessageFeedbackOptions['submit']> {
  const base = new URL(endpoint);
  const local = base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname);
  const project = base.origin === 'https://feedback.botharness.ai';
  if ((!local && !project) || base.pathname !== '/feedback')
    throw new Error('feedback-endpoint-not-allowed');
  if (base.username || base.password || base.search || base.hash)
    throw new Error('invalid-feedback-endpoint');
  return async ({ reportId, archive, feedback, version }) => {
    if (archive.length > 15 * 1024 * 1024) throw new Error('feedback-too-large');
    const form = new FormData();
    form.set('metadata', JSON.stringify({ ...feedback, version }));
    form.set(
      'archive',
      new Blob([new Uint8Array(archive)], { type: 'application/zip' }),
      'evidence.zip',
    );
    const response = await fetch(
      new URL(`${base.pathname.replace(/\/$/u, '')}/${reportId}`, base),
      {
        method: 'POST',
        body: form,
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) throw new Error('feedback-upload-refused');
    const receipt = receiptSchema.parse(await response.json());
    if (receipt.reportId !== reportId) throw new Error('feedback-receipt-mismatch');
    return receipt;
  };
}
