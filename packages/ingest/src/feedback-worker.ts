import { createFeedbackService, type FeedbackBucket } from './feedback.js';

interface Env {
  FEEDBACK_BUCKET: FeedbackBucket;
  FEEDBACK_ADMIN_TOKEN: string;
  FEEDBACK_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  POSTHOG_KEY?: string;
}

function service(env: Env) {
  return createFeedbackService({
    bucket: env.FEEDBACK_BUCKET,
    adminToken: env.FEEDBACK_ADMIN_TOKEN,
    log: (event) => console.warn(JSON.stringify({ event: 'message-feedback', ...event })),
    ...(env.POSTHOG_KEY
      ? {
          index: async (event) => {
            const response = await fetch('https://us.i.posthog.com/i/v0/e/', {
              method: 'POST',
              redirect: 'error',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                api_key: env.POSTHOG_KEY,
                uuid: event.reportId,
                event: 'message_feedback',
                properties: {
                  distinct_id: event.reportId,
                  $process_person_profile: false,
                  report_id: event.reportId,
                  report_url: `https://feedback.botharness.ai/feedback/${event.reportId}/view`,
                  rating: event.rating,
                  tags: event.tags,
                  version: event.version,
                  bytes: event.bytes,
                },
              }),
              signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) throw new Error('index-refused');
          },
        }
      : {}),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.FEEDBACK_BUCKET || !env.FEEDBACK_ADMIN_TOKEN)
      return Response.json({ error: { code: 'feedback-unavailable' } }, { status: 503 });
    if (request.method === 'POST' && env.FEEDBACK_RATE_LIMITER) {
      const limit = await env.FEEDBACK_RATE_LIMITER.limit({
        key: request.headers.get('cf-connecting-ip') ?? 'local',
      });
      if (!limit.success)
        return Response.json({ error: { code: 'rate-limited' } }, { status: 429 });
    }
    return service(env).fetch(request);
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await service(env).expire();
  },
};
