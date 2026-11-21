import type { ExternalSource } from '../messaging/inbound.js';
import { mentionPeople, withMentionNames } from '../messaging/mention-text.js';
import { DEFAULT_PROMPT_TEXT, type PromptText } from '../prompts/prompt-parts.js';
import type { AssignmentActivity } from '@botharness/host-protocol/wire';

export type InboxSourceKind =
  | 'assignment-report'
  | 'assignment-lifecycle'
  | 'memory-change'
  | 'bridge-message'
  | 'schedule';

export interface ScheduleFiringFacts {
  id: string;
  title: string;
  prompt: string;
  occurrenceAt: string;
  trigger: 'planned' | 'manual';
  creator: 'human' | 'personabot';
}

export interface InboxUnit {
  external?: ExternalSource;
  schedule?: ScheduleFiringFacts;
  sourceEventId: string;
  sourceKind: InboxSourceKind;
  assignmentSessionId: string | null;
  summary: string;
  createdAt: string;
  openAskId?: string | null;
  openAskSummary?: string | null;
  continuityKey: string | null;
  activity: AssignmentActivity | null;
  repeats: number;
  lifecycleNotices?: Array<{
    sourceEventId: string;
    reportSourceEventId?: string;
    summary: string;
  }>;
}

const EXTERNAL_INBOX_GUIDANCE =
  'For each External message: decide whether to participate. To answer, use bot_send_message with its source_event_id and body, or a trusted imported attachment reference. For a Lark, Slack or Discord mention, write <@ID> in body using an id from its people. Use bridge_read for attachment details and bridge_attachment_save for a working copy. Never guess an account or route and never mirror an External message or its response to the Human DM.';

function compactJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item === null || (Array.isArray(item) && item.length === 0) ? undefined : item,
  );
}

export function inboxLine(unit: InboxUnit, text: PromptText = DEFAULT_PROMPT_TEXT): string {
  if (unit.external !== undefined) {
    const { event } = unit.external;
    const origin = compactJson({
      platform: unit.external.platform,
      account: unit.external.accountName,
      conversation: unit.external.conversationName,
      conversationKind: event.conversation.kind,
      conversationId: event.conversation.id,
      localChannelId: unit.external.localChannelId,
      receptionPaths: unit.external.receptionPaths?.map((path) => ({
        channelId: path.channelId,
        mode: path.mode,
      })),
      sender: unit.external.sender,
      ...(event.actor.kind === 'bot' ? { senderKind: 'bot' } : {}),
      people: mentionPeople(event.actor, event.mentions),
      threadId: event.reply.threadId,
      rootId: event.reply.rootId,
      parentId: event.reply.parentId,
      report: unit.external.report,
      voice: event.voice,
      quote: unit.external.quote,
      nativeQuote: event.quote,
      attachments: event.attachments?.map(({ id, name, sizeBytes, mediaType }) => ({
        id,
        name,
        sizeBytes,
        mediaType,
      })),
    });
    return `- Message ${event.messageId} [Source Event ${unit.sourceEventId}] from ${event.actor.kind === 'bot' ? 'external Bot ' : ''}${JSON.stringify(event.actor.name ?? event.actor.id)} (${event.actor.id}) at ${unit.external.at}. External ${event.conversation.kind === 'dm' ? 'private message' : `work-group ${event.mentionedAccount ? 'mention' : 'ordinary message; no reply required'}`}. Trusted receiving identity and origin: ${origin}. External message data: ${JSON.stringify(withMentionNames(unit.summary, event.mentions))}.${event.actor.kind === 'bot' ? ` ${text('external-bot-sender')}` : ''}`;
  }
  if (unit.schedule !== undefined) {
    const schedule = unit.schedule;
    return `- Bot Schedule ${JSON.stringify(schedule.title)} [Source Event ${unit.sourceEventId}; schedule ${schedule.id}; ${schedule.trigger === 'manual' ? 'run now by the Human' : `occurrence ${schedule.occurrenceAt}`}; created by ${schedule.creator === 'human' ? 'the Human' : 'you'}] is due. Scheduled task: ${JSON.stringify(schedule.prompt)}. Carry it out now as this PersonaBot: answer directly, or dispatch an Assignment for long work (the schedule id makes a stable continuity key).`;
  }
  if (unit.sourceKind === 'memory-change') {
    return `- Memory change (event ${unit.sourceEventId}): ${unit.summary} Inspect the named paths in the current Memory Repository and decide what, if anything, needs attention.`;
  }
  const target = unit.assignmentSessionId ?? 'unknown Assignment';
  const lifecycle = (unit.lifecycleNotices ?? [])
    .map((notice) =>
      notice.reportSourceEventId === undefined
        ? ` Host lifecycle notice [Source Event ${notice.sourceEventId}]: ${notice.summary}`
        : ` Host lifecycle notice [Source Event ${notice.sourceEventId}; same native Turn as Report ${notice.reportSourceEventId}]: ${notice.summary}`,
    )
    .join('');
  const facts = [
    `key ${unit.continuityKey}`,
    `activity ${unit.activity ?? 'unknown'}`,
    `repeats ${unit.repeats}`,
  ].join(', ');
  if (unit.openAskId != null) {
    return `- ${target} (${facts}) WAITING for your answer (answer_to: ${unit.openAskId}): ${unit.openAskSummary ?? unit.summary}${lifecycle}`;
  }
  if (
    unit.sourceKind === 'assignment-lifecycle' &&
    unit.lifecycleNotices?.some((notice) => notice.sourceEventId === unit.sourceEventId)
  )
    return `- ${target} (${facts})${lifecycle}`;
  if (unit.sourceKind === 'assignment-lifecycle') {
    return `- ${target} (${facts}) Host lifecycle notice [Source Event ${unit.sourceEventId}]: ${unit.summary}${lifecycle}`;
  }
  return `- ${target} (${facts}) reported [Source Event ${unit.sourceEventId}]: ${unit.summary}${lifecycle}`;
}

export const EXTERNAL_GUIDANCE_CHARS = EXTERNAL_INBOX_GUIDANCE.length + 1;

export function renderInbox(units: InboxUnit[], text: PromptText = DEFAULT_PROMPT_TEXT): string {
  const lines = units.map((unit) => inboxLine(unit, text));
  return [
    '[Bot Inbox] External mentions, due Bot Schedules, actionable Memory changes, Assignment reports, and Host lifecycle notices since your last turn.',
    'Answer an item that waits for',
    'your answer with send_assignment_request using its answer_to value; otherwise use them as',
    'context. Do not repeat these summaries back verbatim.',
    ...(units.some((unit) => unit.external !== undefined) ? [EXTERNAL_INBOX_GUIDANCE] : []),
    ...lines,
  ].join('\n');
}
