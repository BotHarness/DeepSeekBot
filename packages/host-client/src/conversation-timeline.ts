import { isSessionTurnModelSwitch, isTurnTargetPath } from '@botharness/host-protocol/turn-target';
import type { RemoteSource } from './client';
import { genuiDocumentOf } from './genui/document';
import { parseSessionLinks } from './session-links';
import { sessionFailure } from './session-failure';
import { activityOf } from './channel-activity';
import type { JournalEntry, WireReplyPreview } from '@botharness/host-protocol/wire';
import { skillInvocationsOf } from './skill-catalog';
import type {
  ConversationMessage,
  ConversationSnapshot,
  ConversationTimelineSnapshot,
  OutgoingFile,
} from './conversation-contract';
import { cardOf, resolvesOf } from './conversation-cards';
import { attachmentsOf, replyThumbnailOf, voiceOf, withReplyThumbnail } from './conversation-media';

export function shownInChat(message: ConversationMessage): boolean {
  const resolution = message.resolves?.resolution;
  if (
    resolution?.kind === 'tool-approval' ||
    resolution?.kind === 'grant' ||
    resolution?.kind === 'private-input' ||
    resolution?.kind === 'takeover' ||
    (resolution?.kind === 'user-question' && resolution.state === 'cancelled')
  )
    return false;
  if (message.welcome === true) return false;
  return (
    message.source?.message.contentPurge !== undefined ||
    message.source?.message.sessionFailure !== undefined ||
    message.activity !== undefined ||
    message.body.trim() !== '' ||
    (message.sessionLinks?.length ?? 0) > 0 ||
    message.attachments.length > 0 ||
    message.card !== undefined ||
    message.resolves !== undefined
  );
}

export function timelineOf(
  current: ConversationSnapshot,
  previous?: ConversationTimelineSnapshot,
): ConversationTimelineSnapshot {
  const sameDrafts =
    previous !== undefined &&
    current.drafts.length === previous.drafts.length &&
    current.drafts.every(
      (draft, index) =>
        draft.draftId === previous.drafts[index]?.draftId &&
        draft.botSlug === previous.drafts[index]?.botSlug,
    );
  if (
    sameDrafts &&
    current.messages === previous.messages &&
    current.status === previous.status &&
    current.reason === previous.reason &&
    current.hasOlder === previous.hasOlder &&
    current.loadingOlder === previous.loadingOlder &&
    current.olderError === previous.olderError &&
    current.fromCache === previous.fromCache
  )
    return previous;
  return {
    ...current,
    drafts: sameDrafts
      ? previous.drafts
      : current.drafts.map(({ draftId, botSlug }) => ({ draftId, botSlug })),
  };
}

export function previewFor(
  preview: WireReplyPreview | null,
  selfHumanId: string | undefined,
): WireReplyPreview | null {
  if (preview?.author.kind !== 'human') return preview;
  const { humanId, displayName } = preview.author;
  return {
    ...preview,
    author:
      selfHumanId !== undefined &&
      humanId !== undefined &&
      humanId !== selfHumanId &&
      displayName !== undefined
        ? { kind: 'human', humanId, displayName }
        : { kind: 'human' },
  };
}

export function present(
  entry: JournalEntry,
  resolve: (path: string) => RemoteSource,
  picked: readonly (OutgoingFile | undefined)[],
  selfHumanId: string | undefined,
): ConversationMessage {
  const message = entry.message;
  const kind = message.author.kind;
  const person =
    message.author.kind === 'human' &&
    selfHumanId !== undefined &&
    message.author.humanId !== undefined &&
    message.author.humanId !== selfHumanId
      ? { humanId: message.author.humanId, name: message.author.displayName ?? '' }
      : undefined;
  const card = cardOf(entry.channelId, message);
  const resolves = resolvesOf(message);
  const activity = activityOf(message);
  const genuiDocument =
    message.contentPurge === undefined ? genuiDocumentOf(message.genui) : undefined;
  const failure = kind === 'bot' ? sessionFailure(message.sessionFailure) : undefined;
  const sessionLinks = kind === 'bot' ? parseSessionLinks(message.sessionLinks) : [];
  const { attachments, voice } = voiceOf(message, attachmentsOf(entry, resolve, picked));
  return {
    id: message.id,
    source: entry,
    revision: entry.revision,
    at: message.at,
    author:
      person !== undefined
        ? 'person'
        : kind === 'human'
          ? 'human'
          : kind === 'bot'
            ? 'bot'
            : 'system',
    ...(message.author.kind === 'bot' ? { bot: message.author.slug } : {}),
    ...(person === undefined ? {} : { person }),
    body: message.body,
    ...(sessionLinks.length === 0 ? {} : { sessionLinks }),
    ...(message.mentions === undefined ? {} : { mentions: message.mentions }),
    ...(kind !== 'human' || message.skillInvocations === undefined
      ? {}
      : { skillInvocations: skillInvocationsOf(message.body, message.skillInvocations) }),
    ...(message.replyTo === undefined
      ? {}
      : {
          replyTo: message.replyTo,
          replyPreview: previewFor(message.replyToPreview ?? null, selfHumanId),
          ...withReplyThumbnail(
            replyThumbnailOf(entry.channelId, message.replyTo, message.replyToPreview, resolve),
          ),
        }),
    attachments,
    ...(voice === undefined ? {} : { voice }),
    ...(isSessionTurnModelSwitch(message.turnModelSwitch)
      ? { turnModelSwitch: message.turnModelSwitch }
      : {}),
    ...(isTurnTargetPath(message.turnTargets) ? { turnTargets: message.turnTargets } : {}),
    ...(genuiDocument === undefined ? {} : { genuiDocument }),
    ...(card === undefined ? {} : { card }),
    ...(resolves === undefined ? {} : { resolves }),
    ...(activity === undefined ? {} : { activity }),
    ...(failure === undefined ? {} : { sessionFailure: failure }),
    ...(message.reactions === undefined || message.reactions.length === 0
      ? {}
      : { reactions: message.reactions }),
    ...(message.deliveries === undefined || message.deliveries.length === 0
      ? {}
      : { deliveries: message.deliveries }),
    delivery: 'committed',
    ...(kind === 'system' && message.onboardingWelcome !== undefined ? { welcome: true } : {}),
  };
}
