import { skillOwnerKey } from '../skills/entries.js';
import type {
  ChannelMention,
  ChannelMessage,
  ChannelSkillInvocation,
} from '../channels/channel.js';
import type { TakeoverResolution } from '../takeover/contracts.js';
import { sessionMentionText } from './session-mentions.js';

export function markSkillTokens(
  text: string,
  invocations: readonly ChannelSkillInvocation[] | undefined,
): string {
  let marked = text;
  for (const skill of [...(invocations ?? [])].sort((a, b) => b.start - a.start)) {
    if (text.slice(skill.start, skill.end) !== '/' + skill.name) continue;
    marked = marked.slice(0, skill.start) + `[/${skill.name}]` + marked.slice(skill.end);
  }
  return marked;
}

export function sessionSkillText(
  body: string,
  mentions: readonly ChannelMention[],
  invocations: readonly ChannelSkillInvocation[] | undefined,
): string {
  const text = sessionMentionText(body, mentions);
  const mentionStarts = mentions
    .filter((mention) => body.slice(mention.start, mention.end) === '@' + mention.label)
    .map((mention) => mention.start);
  const rebased = invocations?.map((skill) => {
    const offset = mentionStarts.filter((start) => start < skill.start).length;
    return { ...skill, start: skill.start + offset, end: skill.end + offset };
  });
  return markSkillTokens(text, rebased);
}

function xmlAttribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;');
}

export function skillInvocationPrompt(
  invocations: readonly ChannelSkillInvocation[] | undefined,
): string {
  if (invocations === undefined || invocations.length === 0) return '';
  const blocks = invocations.map((skill) => {
    const owner = xmlAttribute(skillOwnerKey(skill.owner));
    const path = skill.path === undefined ? '' : ` path="${xmlAttribute(skill.path)}"`;
    return `<skill_invocation name="${skill.name}" owner="${owner}"${path}>\n${skill.content}\n</skill_invocation>`;
  });
  return `\n\n[The Human invoked ${invocations.length === 1 ? 'this Skill' : 'these Skills'} with /. Each block is the Skill text as it was when the message was sent; follow it for this message. owner names whose Skill it is, not who should act.]\n${blocks.join('\n')}`;
}

const TAKEOVER_OUTCOME_GUIDANCE: Record<TakeoverResolution['outcome'], string> = {
  done: 'The Human says they finished. Their result is not verified: observe again first (take a fresh Computer screenshot or call browser_observe), confirm the step really succeeded, then continue the original task and tell the Human the result in this Channel.',
  failed:
    'The Human could not finish. Observe the current state, then either try another way, ask the Human briefly what blocked them, or report that the task cannot continue.',
  cancelled:
    'The Human cancelled the request; they no longer need it. Do not request a takeover again unless they ask. Reply briefly only if that helps.',
  expired:
    'Nobody finished the request before it expired. Observe the current state; if the step is still blocked, tell the Human briefly instead of requesting again right away.',
};

export function takeoverResolutionPrompt(
  sourceEventId: string,
  channelId: string,
  resolution: TakeoverResolution,
  request: ChannelMessage | undefined,
): string {
  const card = request?.takeoverRequest;
  const facts = {
    id: resolution.requestMessageId,
    target: card?.target ?? 'unknown',
    title: card?.title ?? 'unknown',
    request: request?.body ?? '',
    outcome: resolution.outcome,
    by: resolution.by,
  };
  return `[Bot Inbox: Takeover Handoff ended]\nSource Event ID: ${sourceEventId}\nChannel: ${channelId}\nHandoff: ${JSON.stringify(facts)}\n${TAKEOVER_OUTCOME_GUIDANCE[resolution.outcome]} Credentials the Human typed stay in the live view; never ask for them in chat.`;
}
