import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ChannelStore } from '../channels/store.js';
import { collectDiagnosticBundle, DiagnosticBundleError, diagnosticBundleZip } from './bundle.js';
import type { DiagnosticBundleHttpOptions } from './bundle-http.js';
import { createDiagnosticRedactor } from './redaction.js';
import {
  feedbackSelectionSchema,
  feedbackRatingSchema,
  type FeedbackRating,
  type FeedbackReceipt,
} from './feedback-contract.js';

export const MESSAGE_FEEDBACK_PATH = '/api/botharness/message-feedback';
export const MESSAGE_FEEDBACK_ACTIONS = ['preview', 'download', 'submit'] as const;
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const tokenSchema = z.object({ token: z.string().uuid() }).strict();
const submitSchema = z
  .object({ token: z.string().uuid(), feedback: feedbackRatingSchema })
  .strict();

export interface MessageFeedbackOptions extends DiagnosticBundleHttpOptions {
  readTimeline: ChannelStore['readHumanTimeline'];
  submit?: (report: {
    reportId: string;
    archive: Buffer;
    digest: string;
    feedback: FeedbackRating;
    version: string;
  }) => Promise<FeedbackReceipt>;
}

export function createMessageFeedbackHttp(options: MessageFeedbackOptions) {
  const now = options.now ?? Date.now;
  const previews = new Map<
    string,
    {
      archive: Buffer;
      expires: number;
      submission?: {
        archive: Buffer;
        digest: string;
        ratingKey: string;
        reportId: string;
        feedback: FeedbackRating;
        receipt?: FeedbackReceipt;
      };
    }
  >();
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers });
      const raw = await request.text();
      if (raw.length > 16_384)
        return Response.json({ error: { code: 'invalid-input' } }, { status: 400, headers });
      const value: unknown = JSON.parse(raw);
      const action = new URL(request.url).pathname.slice(MESSAGE_FEEDBACK_PATH.length + 1);
      for (const [token, entry] of previews) if (entry.expires <= now()) previews.delete(token);
      if (action === 'preview') {
        const selection = feedbackSelectionSchema.parse(value);
        const page = options.readTimeline(selection.channelId, {
          direction: 'around',
          around: selection.messageId,
          olderLimit: selection.before,
          newerLimit: selection.after,
        });
        const first = page?.entries[0];
        const last = page?.entries.at(-1);
        if (!page || !first || !last)
          throw new DiagnosticBundleError('message-not-found', 'Message unavailable');
        const bundle = await collectDiagnosticBundle(
          options.source,
          {
            channelId: selection.channelId,
            fromMessageId: first.id,
            toMessageId: last.id,
            messageIds: [selection.messageId],
            paddingMinutes: 0,
          },
          createDiagnosticRedactor({ homes: options.homes }),
          { ...selection, messages: page.entries },
        );
        const token = randomUUID();
        const archive = diagnosticBundleZip(bundle);
        if (archive.length > 15 * 1024 * 1024)
          throw new DiagnosticBundleError('too-large', 'Select less evidence');
        while (previews.size >= 4) {
          const oldest = previews.keys().next();
          if (oldest.done) break;
          previews.delete(oldest.value);
        }
        previews.set(token, { archive, expires: now() + 30 * 60_000 });
        options.log?.(`message-feedback initiator=human phase=previewed bytes=${archive.length}`);
        return Response.json(
          {
            token,
            summary: bundle.summary,
            bytes: archive.length,
            selection,
            files: bundle.entries.map((entry) => ({
              path: entry.path,
              content: entry.data.toString('utf8'),
            })),
            canSubmit: options.submit !== undefined,
          },
          { headers },
        );
      }
      const { token } = tokenSchema.parse(
        action === 'submit' ? { token: submitSchema.parse(value).token } : value,
      );
      const entry = previews.get(token);
      if (!entry)
        return Response.json({ error: { code: 'preview-stale' } }, { status: 409, headers });
      if (action === 'download')
        return new Response(new Uint8Array(entry.archive), {
          headers: {
            ...headers,
            'content-type': 'application/zip',
            'content-disposition': 'attachment; filename="message-feedback.zip"',
          },
        });
      if (action !== 'submit') return new Response(null, { status: 404, headers });
      if (!options.submit)
        return Response.json({ error: { code: 'feedback-unavailable' } }, { status: 503, headers });
      const { feedback } = submitSchema.parse(value);
      const ratingKey = JSON.stringify(feedback);
      if (entry.submission && entry.submission.ratingKey !== ratingKey)
        return Response.json({ error: { code: 'submission-frozen' } }, { status: 409, headers });
      entry.submission ??= {
        archive: entry.archive,
        digest: createHash('sha256').update(entry.archive).digest('hex'),
        ratingKey,
        reportId: randomUUID(),
        feedback: {
          ...feedback,
          comment: Array.from(
            createDiagnosticRedactor({ homes: options.homes }).text(feedback.comment),
          )
            .slice(0, 500)
            .join(''),
        },
      };
      if (!entry.submission.receipt) {
        const started = now();
        options.log?.('message-feedback initiator=human phase=submitting');
        entry.submission.receipt = await options.submit({
          ...entry.submission,
          version: options.source.environment.version,
        });
        options.log?.(
          `message-feedback initiator=human phase=accepted durationMs=${now() - started}`,
        );
      }
      return Response.json(entry.submission.receipt, { headers });
    } catch (error) {
      const code =
        error instanceof DiagnosticBundleError
          ? error.code
          : error instanceof z.ZodError || error instanceof SyntaxError
            ? 'invalid-input'
            : 'feedback-failed';
      options.log?.(`message-feedback initiator=human phase=refused reason=${code}`);
      return Response.json(
        { error: { code } },
        { status: code === 'feedback-failed' ? 502 : 400, headers },
      );
    }
  };
}
