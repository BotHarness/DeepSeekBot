import type { MessageFeedbackOptions } from './message-feedback-http.js';
import { z } from 'zod';
import { TELEMETRY_API_KEY, TELEMETRY_ENDPOINT } from '../telemetry/service.js';

const acknowledgementSchema = z.object({
  status: z.union([z.literal(1), z.literal('Ok')]),
  quota_limited: z.array(z.string()).max(0).optional(),
});

export function feedbackUploader(
  endpoint = TELEMETRY_ENDPOINT,
): NonNullable<MessageFeedbackOptions['submit']> {
  if (endpoint !== TELEMETRY_ENDPOINT) throw new Error('feedback-endpoint-not-allowed');
  return async ({ reportId, feedback, version, turn }) => {
    const response = await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
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
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('feedback-upload-refused');
    if (!acknowledgementSchema.safeParse(await response.json()).success)
      throw new Error('feedback-upload-refused');
    return { reportId };
  };
}
