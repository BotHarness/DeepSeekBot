import type { HostClient } from './client';
import {
  feedbackRatingSchema,
  feedbackSelectionSchema,
  feedbackPreviewSchema,
  feedbackReceiptSchema,
  feedbackErrorSchema,
  type FeedbackPreview,
  type FeedbackReceipt,
  type FeedbackSelectionInput,
  type FeedbackRatingInput,
} from '../../../../packages/core/src/diagnostics/feedback-contract';

export function createMessageFeedback(client: Pick<HostClient, 'api'>) {
  async function request(action: 'preview' | 'submit', body: Record<string, unknown>) {
    const answer = await client.api('/api/botharness/message-feedback/' + action, {
      body,
      timeoutMs: 75_000,
    });
    if (answer.status >= 400) {
      const error = feedbackErrorSchema.safeParse(answer.body);
      throw new Error(error.success ? error.data.error.code : 'feedback-unavailable');
    }
    return answer.body;
  }
  return {
    async download(token: string): Promise<Uint8Array> {
      const answer = await client.api('/api/botharness/message-feedback/download', {
        body: { token },
        response: 'bytes',
        timeoutMs: 75_000,
      });
      if (!(answer.body instanceof Uint8Array)) {
        const error = feedbackErrorSchema.safeParse(answer.body);
        throw new Error(error.success ? error.data.error.code : 'download-failed');
      }
      return answer.body;
    },
    async preview(selection: FeedbackSelectionInput): Promise<FeedbackPreview> {
      return feedbackPreviewSchema.parse(
        await request('preview', feedbackSelectionSchema.parse(selection)),
      );
    },
    async submit(report: {
      token: string;
      feedback: FeedbackRatingInput;
    }): Promise<FeedbackReceipt> {
      return feedbackReceiptSchema.parse(
        await request('submit', {
          token: report.token,
          feedback: feedbackRatingSchema.parse(report.feedback),
        }),
      );
    },
  };
}

export type {
  FeedbackPreview,
  FeedbackReceipt,
} from '../../../../packages/core/src/diagnostics/feedback-contract';
