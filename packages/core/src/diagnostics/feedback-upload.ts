import { FEEDBACK_RECEIVER_TIMEOUT_MS } from '@botharness/host-protocol/feedback-failure';
import { z } from 'zod';
import { TELEMETRY_API_KEY, TELEMETRY_ENDPOINT } from '../telemetry/service.js';
import { FeedbackUploadError } from './feedback-contract.js';
import type { MessageFeedbackOptions } from './message-feedback-http.js';

const acknowledgementSchema = z.object({
  status: z.union([z.literal(1), z.literal('Ok')]),
  quota_limited: z.array(z.string()).max(0).optional(),
});

export function feedbackUploader(
  endpoint = TELEMETRY_ENDPOINT,
): NonNullable<MessageFeedbackOptions['submit']> {
  if (endpoint !== TELEMETRY_ENDPOINT) throw new Error('feedback-endpoint-not-allowed');
  return async ({ reportId, feedback, version, turn }) => {
    const body = JSON.stringify({
      api_key: TELEMETRY_API_KEY,
      batch: [
        {
          event: 'chat:message_feedback_submit',
          uuid: reportId,
          distinct_id: reportId,
          properties: {
            $process_person_profile: false,
            $geoip_disable: true,
            feedback_id: reportId,
            rating: feedback.rating,
            tags: feedback.tags,
            comment: feedback.comment,
            version,
            ...(turn ? { failed_turn: turn } : {}),
          },
        },
      ],
    });
    const signal = AbortSignal.timeout(FEEDBACK_RECEIVER_TIMEOUT_MS);
    try {
      const response = await fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        redirect: 'error',
        signal,
      });
      const { status } = response;
      if (status === 401 || status === 403)
        throw new FeedbackUploadError({ reason: 'auth', status });
      if (response.ok) {
        const acknowledgement: unknown = await response.json().catch((error: unknown) => {
          if (!(error instanceof SyntaxError)) throw error;
        });
        if (acknowledgementSchema.safeParse(acknowledgement).success) return { reportId };
      }
      throw new FeedbackUploadError({ reason: 'receiver-error', status });
    } catch (error) {
      if (error instanceof FeedbackUploadError) throw error;
      throw new FeedbackUploadError({ reason: signal.aborted ? 'timeout' : 'network' });
    }
  };
}
