import { readAllBotPreview } from '@botharness/host-client/channel-management';
import type { ChatPlace } from './chat-place';
import { useSourceDraft } from '../../host/native-source-drafts';
import { hostDraftKey } from '../../host/source-drafts';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { type ConversationMessage } from '@botharness/host-client/conversation';
import type { WireAllBotPreview } from '@botharness/host-protocol/wire';
import { MAX_PICKED, pickFiles, type PickSource, type PickedFile } from '../../host/pick-files';
import { answerInChat } from '@botharness/host-client/requests';
import { useDictation } from '../../host/speech';
import { showDictationProblem } from './dictation-problem';
import { type ComposerInput } from './composer';
import { useGenuiInputViewport } from './genui-input-viewport';
import { useClipboardImage } from './clipboard-image';
import type { GenuiDocumentReply } from '@botharness/host-client/genui/document';
import {
  activeMentionQuery,
  chooseMention,
  mentionCandidates,
  quoteMention,
  rebaseMentions,
  submittedMessage,
  type MentionCandidate,
  type SelectedMention,
} from './mention-draft';
import {
  activeSkillQuery,
  deleteSkillBackward,
  rebaseSkills,
  selectSkill,
  skillMatches,
  skillOptions,
  submittedSkills,
  type SelectedSkill,
  type SkillOption,
} from './skill-draft';
import { useSkillCatalog } from './use-skill-catalog';
import { sendJumpPreferences } from '../../host/native-send-jump';
import { createSendFlights, textFrame, type SendFlight } from './send-fly';
import { edgeFade, space } from '../design/tokens';
import type { useStrings } from '../strings';
import type { useConversationSource } from './conversation-source';
import type { useConversationMessageState } from './conversation-message-actions';
import type { useConversationTimeline } from './conversation-timeline';

export function useConversationDraft({
  place,
  source,
}: {
  place: ChatPlace;
  source: Pick<ReturnType<typeof useConversationSource>, 'client' | 'saved' | 'slug'>;
}) {
  const { client, saved, slug } = source;
  const draftKey = hostDraftKey(
    saved?.hostId ?? '',
    place.kind,
    (place.kind === 'dm' ? place.slug : place.channelId) ?? '',
  );
  const [draft, setDraft, draftPersistence] = useSourceDraft(draftKey);
  const [retryingDraft, setRetryingDraft] = useState(false);
  const draftRetryPending = useRef(false);
  const retryDraft = async () => {
    if (draftRetryPending.current) return;
    draftRetryPending.current = true;
    setRetryingDraft(true);
    try {
      await draftPersistence.retry();
    } finally {
      draftRetryPending.current = false;
      setRetryingDraft(false);
    }
  };
  const [mentions, setMentions] = useState<SelectedMention[]>([]);
  const [skills, setSkills] = useState<SelectedSkill[]>([]);
  const [caret, setCaret] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number }>();
  const [allPreview, setAllPreview] = useState<{ key: string; preview: WireAllBotPreview }>();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const sentFiles = useRef<readonly PickedFile[] | undefined>(undefined);
  const [attachError, setAttachError] = useState(false);
  const dictation = useDictation(
    (text, nextCaret) => {
      setDraft(text);
      if (nextCaret !== undefined) {
        setCaret(nextCaret);
        setSelection({ start: nextCaret, end: nextCaret });
      }
    },
    { client, slug, onProblem: showDictationProblem },
  );
  return {
    draftKey,
    draft,
    setDraft,
    draftPersistence,
    retryingDraft,
    retryDraft,
    mentions,
    setMentions,
    skills,
    setSkills,
    caret,
    setCaret,
    selection,
    setSelection,
    allPreview,
    setAllPreview,
    files,
    setFiles,
    sentFiles,
    attachError,
    setAttachError,
    dictation,
  };
}

export function useConversationComposer({
  focused,
  headerOverlap,
  android,
  headerPadding,
  profileOpen,
  profileOpening,
  source,
  draftState,
  messageState,
  timeline,
}: {
  focused: boolean;
  headerOverlap: number;
  android: boolean;
  headerPadding: number;
  profileOpen: boolean;
  profileOpening: boolean;
  source: Pick<
    ReturnType<typeof useConversationSource>,
    'host' | 'dm' | 'botDm' | 'conversation' | 'members'
  >;
  draftState: ReturnType<typeof useConversationDraft>;
  messageState: Pick<
    ReturnType<typeof useConversationMessageState>,
    'selectionScope' | 'setReplying'
  >;
  timeline: ReturnType<typeof useConversationTimeline>;
}) {
  const { host, dm, botDm, conversation, members } = source;
  const { draft, setDraft, mentions, setMentions, setCaret, setSelection, files } = draftState;
  const { selectionScope, setReplying } = messageState;
  const { speakers, scroll, viewport, content, frame, latest } = timeline;
  const sendGenuiReply = useCallback(
    (body: string, reply: GenuiDocumentReply) => {
      latest.jumpToLatest();
      return conversation?.send(body, [], { genuiReply: reply }) ?? '';
    },
    [conversation, latest],
  );
  const { composerHeight, viewportHeight, viewportLayout } = latest;
  const stage = useMemo(
    () => ({
      registry: speakers,
      scroll,
      viewport,
      viewportLayout,
      frame,
      content,
      inverted: android,
      floor: composerHeight + edgeFade.bottom,
    }),
    [speakers, scroll, viewport, viewportLayout, frame, content, android, composerHeight],
  );
  const composerInput = useRef<ComposerInput>(null);
  const genuiInputViewport = useGenuiInputViewport(
    composerInput,
    latest.reveal,
    headerOverlap + headerPadding + space.x3,
    Platform.OS === 'ios' && focused && !profileOpen && !profileOpening,
    selectionScope,
  );
  const genuiInteraction = useMemo(
    () => ({
      send: dm && conversation !== undefined ? sendGenuiReply : undefined,
      inputViewport: Platform.OS === 'ios' ? genuiInputViewport : undefined,
    }),
    [dm, conversation, sendGenuiReply, genuiInputViewport],
  );
  const flights = useMemo(() => createSendFlights(false), []);
  const launchFly = useCallback((): SendFlight => {
    const flight: SendFlight = { from: undefined };
    composerInput.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0)
        flight.from = textFrame({ x, y, width, height }, space.x3, space.x2);
    });
    return flight;
  }, []);
  const [typing, setTyping] = useState(false);
  const clipboard = useClipboardImage(typing && files.length < MAX_PICKED);
  const online = host.connection.status === 'connected';
  const composable = !botDm && conversation !== undefined && online;
  const { jumpToLatest } = latest;
  const compose = useCallback(() => {
    jumpToLatest();
    composerInput.current?.focus();
  }, [jumpToLatest]);
  const quoteDraft = useRef({ draft, mentions, members, dm });
  useLayoutEffect(() => {
    quoteDraft.current = { draft, mentions, members, dm };
  }, [draft, mentions, members, dm]);
  const startReply = useCallback(
    (message: ConversationMessage) => {
      setReplying({ scope: selectionScope, message });
      const current = quoteDraft.current;
      const member =
        current.dm || message.author !== 'bot'
          ? undefined
          : current.members.find((entry) => entry.slug === message.bot && !entry.paused);
      if (member !== undefined) {
        const next = quoteMention(current.draft, current.mentions, member.slug, member.displayName);
        if (next.value !== current.draft) setDraft(next.value);
        setMentions(next.mentions);
        setCaret(next.caret);
        setSelection({ start: next.caret, end: next.caret });
      }
      composerInput.current?.focus();
    },
    [selectionScope, setDraft],
  );
  return {
    composerHeight,
    viewportHeight,
    viewportLayout,
    stage,
    composerInput,
    genuiInteraction,
    flights,
    launchFly,
    typing,
    setTyping,
    clipboard,
    online,
    composable,
    compose,
    startReply,
  };
}

export function useConversationDraftActions({
  t,
  asking,
  source,
  draftState,
  messageState,
  timeline,
  composer,
}: {
  t: ReturnType<typeof useStrings>;
  asking: ConversationMessage | undefined;
  source: ReturnType<typeof useConversationSource>;
  draftState: ReturnType<typeof useConversationDraft>;
  messageState: Pick<
    ReturnType<typeof useConversationMessageState>,
    'setInitiatedRequest' | 'setReplying' | 'replyTarget'
  >;
  timeline: Pick<ReturnType<typeof useConversationTimeline>, 'setAnswered' | 'latest'>;
  composer: Pick<ReturnType<typeof useConversationComposer>, 'flights' | 'launchFly'>;
}) {
  const {
    client,
    inbox,
    saved,
    host,
    dm,
    slug,
    channelId,
    channel,
    conversation,
    members,
    activeChannel,
  } = source;
  const {
    draft,
    setDraft,
    draftPersistence,
    mentions,
    setMentions,
    skills,
    setSkills,
    caret,
    setCaret,
    setSelection,
    allPreview,
    setAllPreview,
    files,
    setFiles,
    sentFiles,
    setAttachError,
    dictation,
  } = draftState;
  const { setInitiatedRequest, setReplying, replyTarget } = messageState;
  const { setAnswered, latest } = timeline;
  const { flights, launchFly } = composer;
  const membersKey = channel === undefined ? undefined : `${channel.id}:${channel.members.join()}`;
  const skillCatalog = useSkillCatalog(client, activeChannel);
  const skillQuery = skillCatalog.length === 0 ? undefined : activeSkillQuery(draft, caret, skills);
  const skillChoices = skillMatches(
    skillOptions(skillCatalog, host.roster?.bots ?? []),
    skillQuery,
  );
  const mentionQuery = dm ? undefined : activeMentionQuery(draft, caret, mentions);
  const candidates = mentionCandidates(members, mentionQuery, mentions, {
    label: t.mentionAll,
    preview: allPreview?.key === membersKey ? allPreview?.preview : undefined,
  });

  const loadAllPreview = () => {
    const key = membersKey;
    if (client === undefined || channelId === undefined || key === undefined) return;
    if (allPreview?.key === key) return;
    readAllBotPreview(client, channelId)
      .then((preview) => setAllPreview({ key, preview }))
      .catch(() => undefined);
  };

  const edit = (typed: string) => {
    const atomic = deleteSkillBackward(draft, typed, skills);
    const next = atomic?.value ?? typed;
    setSkills(atomic?.skills ?? rebaseSkills(draft, next, skills));
    if (atomic !== undefined) {
      setCaret(atomic.caret);
      setSelection({ start: atomic.caret, end: atomic.caret });
    }
    setMentions((current) => rebaseMentions(draft, next, current));
    setDraft(next);
    if (!dm && next.includes('@')) loadAllPreview();
  };

  const mention = (candidate: MentionCandidate) => {
    if (mentionQuery === undefined) return;
    const chosen = chooseMention(draft, mentions, mentionQuery, candidate);
    setDraft(chosen.value);
    setMentions(chosen.mentions);
    setCaret(chosen.caret);
    setSelection({ start: chosen.caret, end: chosen.caret });
  };

  const chooseSkill = (option: SkillOption) => {
    if (skillQuery === undefined) return;
    const chosen = selectSkill(draft, skills, skillQuery, option);
    setMentions((current) => rebaseMentions(draft, chosen.value, current));
    setDraft(chosen.value);
    setSkills(chosen.skills);
    setCaret(chosen.caret);
    setSelection({ start: chosen.caret, end: chosen.caret });
  };

  const send = () => {
    if (host.connection.status !== 'connected') return;
    if (!draftPersistence.loaded || draftPersistence.failed) return;
    const live = draftPersistence.read();
    const submitted = submittedMessage(live, mentions);
    const body = submitted.body;
    const attached = files === sentFiles.current ? [] : files;
    const invoked = submittedSkills(live, skills);
    const tagged =
      invoked.length === 0 ? submitted.tags : { ...submitted.tags, skillInvocations: invoked };
    const tags = replyTarget === undefined ? tagged : { ...tagged, replyTo: replyTarget.id };
    if ((body === '' && attached.length === 0) || conversation === undefined) return;
    if (tags.allBotMention?.preview.recipients.length === 0) return;
    if (dictation.state.status !== 'idle') dictation.cancel();
    draftPersistence.take(live);
    sentFiles.current = files;
    setMentions([]);
    setSkills([]);
    setFiles([]);
    setReplying(undefined);
    const flight = latest.send(sendJumpPreferences.getSnapshot().enabled) ? launchFly() : undefined;
    const fly = (messageId: string) => {
      if (flight !== undefined) flights.launch(messageId, flight);
      return messageId;
    };
    if (
      replyTarget !== undefined ||
      !dm ||
      asking?.card === undefined ||
      client === undefined ||
      slug === undefined ||
      attached.length > 0
    ) {
      const messageId = fly(conversation.send(body, attached, tags));
      if (dm && saved && slug)
        setInitiatedRequest({
          hostId: saved.hostId,
          ...(activeChannel === undefined ? {} : { channelId: activeChannel }),
          messageId,
          botSlug: slug,
        });
      return;
    }
    const ref = {
      channelId: asking.card.channelId,
      messageId: asking.id,
      botSlug: slug,
    };
    void answerInChat(client, ref, body)
      .catch(() => false)
      .then((done) => {
        if (!done) {
          const messageId = conversation.send(body, attached);
          if (saved && slug)
            setInitiatedRequest({
              hostId: saved.hostId,
              ...(activeChannel === undefined ? {} : { channelId: activeChannel }),
              messageId,
              botSlug: slug,
            });
          return;
        }
        setAnswered((current) => new Set([...current, asking.id]));
        void inbox?.refresh();
      });
  };

  const pick = (source: PickSource) => {
    setAttachError(false);
    pickFiles(source, MAX_PICKED - files.length)
      .then((more) => setFiles((current) => [...current, ...more].slice(0, MAX_PICKED)))
      .catch(() => setAttachError(true));
  };
  return { skillChoices, candidates, edit, mention, chooseSkill, send, pick };
}
