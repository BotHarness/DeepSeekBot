import type { CompanionRequest } from '../../../core/src/companions/feed.js';
import type { UserQuestionItem } from './store.js';

export type CompanionRequestTarget = Pick<
  CompanionRequest,
  'channelId' | 'botSlug' | 'sessionId'
> & {
  live: boolean;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function questionItem(value: unknown): UserQuestionItem | undefined {
  if (
    !record(value) ||
    typeof value['id'] !== 'string' ||
    !value['id'] ||
    typeof value['question'] !== 'string' ||
    !value['question'] ||
    (value['header'] !== undefined && typeof value['header'] !== 'string') ||
    (value['detail'] !== undefined && typeof value['detail'] !== 'string') ||
    (value['multiSelect'] !== undefined && typeof value['multiSelect'] !== 'boolean')
  )
    return;
  const raw = value['options'];
  if (raw !== undefined && !Array.isArray(raw)) return;
  const options = raw?.flatMap((option: unknown) =>
    record(option) &&
    typeof option['label'] === 'string' &&
    option['label'] &&
    (option['description'] === undefined || typeof option['description'] === 'string')
      ? [
          {
            label: option['label'],
            ...(typeof option['description'] === 'string'
              ? { description: option['description'] }
              : {}),
          },
        ]
      : [],
  );
  if (
    raw !== undefined &&
    options &&
    (options.length !== raw.length ||
      new Set(options.map((item) => item.label)).size !== options.length)
  )
    return;
  return {
    id: value['id'],
    question: value['question'],
    ...(typeof value['header'] === 'string' ? { header: value['header'] } : {}),
    ...(typeof value['detail'] === 'string' ? { detail: value['detail'] } : {}),
    ...(typeof value['multiSelect'] === 'boolean' ? { multiSelect: value['multiSelect'] } : {}),
    ...(options === undefined ? {} : { options }),
  };
}

export function companionRequests(value: unknown, botSlug: string): CompanionRequest[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown): CompanionRequest[] => {
    if (
      !record(item) ||
      item['botSlug'] !== botSlug ||
      typeof item['channelId'] !== 'string' ||
      !item['channelId'] ||
      typeof item['messageId'] !== 'string' ||
      !item['messageId'] ||
      typeof item['sessionId'] !== 'string' ||
      !item['sessionId'] ||
      typeof item['channelName'] !== 'string'
    )
      return [];
    const target = {
      botSlug,
      channelId: item['channelId'],
      messageId: item['messageId'],
      sessionId: item['sessionId'],
      channelName: item['channelName'],
    };
    if (item['kind'] === 'user-question') {
      const raw = item['questions'];
      if (!Array.isArray(raw) || raw.length < 1) return [];
      const questions = raw.flatMap((question: unknown) => {
        const parsed = questionItem(question);
        return parsed ? [parsed] : [];
      });
      if (
        questions.length !== raw.length ||
        new Set(questions.map((question) => question.id)).size !== questions.length
      )
        return [];
      if (item['callId'] !== undefined && (typeof item['callId'] !== 'string' || !item['callId']))
        return [];
      return [
        {
          ...target,
          kind: 'user-question',
          questions,
          ...(typeof item['callId'] === 'string' ? { callId: item['callId'] } : {}),
        },
      ];
    }
    if (
      item['kind'] !== 'tool-approval' ||
      typeof item['callId'] !== 'string' ||
      !item['callId'] ||
      typeof item['toolName'] !== 'string' ||
      (item['role'] !== 'orchestrator' && item['role'] !== 'assignment') ||
      typeof item['cwd'] !== 'string' ||
      typeof item['input'] !== 'string' ||
      typeof item['expiresAt'] !== 'string' ||
      !Number.isFinite(Date.parse(item['expiresAt']))
    )
      return [];
    return [
      {
        ...target,
        kind: 'tool-approval',
        callId: item['callId'],
        toolName: item['toolName'],
        role: item['role'],
        cwd: item['cwd'],
        input: item['input'],
        expiresAt: item['expiresAt'],
      },
    ];
  });
}
