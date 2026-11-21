import { createHash, randomUUID } from 'node:crypto';

import type { ChannelMessage } from '../../channels/channel.js';
import type { ChannelStore } from '../../channels/store.js';
import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import {
  approvalSessionExcerpt,
  reviewerCallInput,
  type ApprovalReview,
  type ApprovalReviewResult,
} from '../../workspaces/approval-reviewer.js';
import type { ToolAutoApproval, TrackedCall } from './tool-approval-types.js';

export async function reviewToolApproval(
  tracked: TrackedCall,
  template: { name: string; text: string },
  channelId: string,
  options: { signal: AbortSignal | undefined; includeSessionHistory: boolean },
  dependencies: {
    autoApproval: ToolAutoApproval | undefined;
    attention: { warn(message: string): void } | undefined;
    channels: ChannelStore;
    findTrackedCall(sessionId: string, callId: string): TrackedCall | undefined;
  },
): Promise<'allowed-once' | undefined> {
  const { signal } = options;
  const auto = dependencies.autoApproval;
  if (auto === undefined) return undefined;
  template = { ...template };
  const templateVersion = createHash('sha256').update(template.text).digest('hex');
  tracked.approvalReview = {
    kind: 'review',
    template: template.name,
    version: templateVersion,
    reason: 'Automatic review unavailable.',
  };
  const started = Date.now();
  let model: string | undefined;
  let reviewSession: string | undefined;
  const log = (outcome: ApprovalReview['outcome'], fallback?: string) => {
    try {
      auto.log({
        botSlug: tracked.botSlug,
        template: template.name,
        templateVersion,
        toolName: tracked.toolName,
        outcome,
        latencyMs: Date.now() - started,
        ...(model === undefined ? {} : { model }),
        ...(reviewSession === undefined ? {} : { reviewSession }),
        ...(fallback === undefined ? {} : { fallback }),
      });
    } catch {
      try {
        dependencies.attention?.warn('approval-review-log-failed');
      } catch {}
    }
  };
  const recordReview = async (
    outcome: 'allowed' | 'ask-human',
    reason: string,
  ): Promise<boolean> => {
    const { sessionId, callId } = tracked;
    if (signal?.aborted || dependencies.findTrackedCall(sessionId, callId) !== tracked)
      return false;
    const record: ChannelMessage = {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'system' },
      body:
        (outcome === 'allowed' ? 'Auto-approved by ' : 'Sent to Human by ') +
        template.name +
        ': ' +
        reason,
      toolAutoApproval: {
        botSlug: tracked.botSlug,
        sessionId: tracked.sessionId,
        callId: tracked.callId,
        toolName: tracked.toolName,
        input: reviewerCallInput(tracked.toolName, tracked.input),
        template: template.name,
        templateVersion,
        outcome,
        reason,
      },
    };
    try {
      const appended = await dependencies.channels.appendMessage(
        OWNER_HUMAN_CONTEXT,
        channelId,
        record,
        undefined,
        () => !signal?.aborted && dependencies.findTrackedCall(sessionId, callId) === tracked,
      );
      return (
        appended !== undefined &&
        !signal?.aborted &&
        dependencies.findTrackedCall(sessionId, callId) === tracked
      );
    } catch {
      return false;
    }
  };
  let review: ApprovalReviewResult;
  try {
    review = await auto.review({
      botSlug: tracked.botSlug,
      template: { ...template, version: templateVersion },
      call: {
        toolName: tracked.toolName,
        input: reviewerCallInput(tracked.toolName, tracked.input),
        cwd: tracked.cwd,
        role: tracked.role,
        channelId,
        ...(tracked.device === undefined
          ? {}
          : { authorization: { device: tracked.device, sessionId: tracked.sessionId } }),
      },
      excerpt: approvalSessionExcerpt(
        options.includeSessionHistory ? tracked.agent.session.snapshotEvents() : [],
        tracked.callId,
        auto.excerptLimits?.(tracked.botSlug),
      ),
      signal: signal ?? new AbortController().signal,
    });
  } catch (error) {
    const failure = error as
      | { code?: unknown; detail?: unknown; model?: unknown; sessionId?: unknown }
      | undefined;
    const code =
      typeof failure?.code === 'string' &&
      [
        'no-model',
        'model-unavailable',
        'settings-invalid',
        'llm-unavailable',
        'timeout',
        'model-error',
        'unparseable',
      ].includes(failure.code)
        ? failure.code
        : 'review-failed';
    tracked.approvalReview = {
      kind: 'review',
      template: template.name,
      version: templateVersion,
      reason: 'Automatic review unavailable (' + code + ').',
      fallback: code,
    };
    if (typeof failure?.model === 'string') model = failure.model;
    if (typeof failure?.sessionId === 'string') reviewSession = failure.sessionId;
    await recordReview('ask-human', tracked.approvalReview.reason);
    log('ask-human', code);
    return undefined;
  }
  model = review.model;
  reviewSession = review.sessionId;
  if (signal?.aborted) {
    log('ask-human', 'cancelled');
    return undefined;
  }
  if (review.outcome !== 'allow') {
    tracked.approvalReview = {
      kind: 'review',
      template: template.name,
      version: templateVersion,
      reason: review.reason,
    };
    await recordReview('ask-human', review.reason);
    log('ask-human');
    return undefined;
  }
  if (!(await recordReview('allowed', review.reason))) {
    log(review.outcome, 'record-unavailable');
    return undefined;
  }
  log(review.outcome);
  tracked.reviewerApproved = true;
  return 'allowed-once';
}
