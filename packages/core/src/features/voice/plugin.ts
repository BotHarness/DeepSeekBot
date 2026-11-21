import type { Context } from '@deepseek-ai/cordis';

import type { BotHarnessCore, createCore } from '../../plugin.js';
import type { createCoreStartup } from '../../diagnostics/core-startup.js';
import {
  LOCAL_VOICE_SKILL_CONTENT,
  LOCAL_VOICE_SKILL_DESCRIPTION,
  LOCAL_VOICE_SKILL_INVOCATION,
  LOCAL_VOICE_SKILL_NAME,
  LOCAL_VOICE_SKILL_PROVIDER,
  LOCAL_VOICE_SKILL_SOURCE,
  LOCAL_VOICE_SKILL_WHEN_TO_USE,
} from '../../voice/skill.js';
import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import { VoiceProviders } from '../../voice/providers.js';
import { createVoiceMessages } from '../../voice/messages.js';
import { createVoiceCalls, type VoiceCalls } from '../../voice/calls.js';
import { callVisualMessage } from '../../voice/call-text.js';
import { voiceCallFramesAt, voiceCallRecordBody } from '../../channels/voice-call-record.js';
import { VOICE_CALL_PATH } from '../../voice/call-contract.js';
import { createVoiceCallHttp } from '../../voice/call-http.js';
import { createTobVoiceOperations } from '../../tob/cli-voice-operations.js';
import type { ChannelDraftEvent } from '../../channels/draft.js';
import type { DiagnosticEvents } from '../../diagnostics/diagnostic-log.js';
import type { createHostModelCatalog } from '../../models/host-models.js';
import type { BridgeMethods } from '../../bridge/methods.js';
import { attachOperationalModule } from '../../database/owner.js';

type Startup = Pick<ReturnType<typeof createCoreStartup>, 'enter'>;

export function apply(
  startup: Startup,
  operationalDatabase: BotHarnessCore['operationalDatabase'],
  registry: Pick<BotHarnessCore['registry'], 'get'>,
  channels: BotHarnessCore['channels'],
  attachments: BotHarnessCore['attachments'],
  options: Pick<
    NonNullable<Parameters<typeof createCore>[0]>,
    'credentials' | 'voiceFetch' | 'voiceLog'
  >,
) {
  startup.enter('voice-providers', 'initialize');
  const voiceProviders = new VoiceProviders({
    database: attachOperationalModule(operationalDatabase, 'voice'),
    credentials: options.credentials ?? (() => undefined),
    ...(options.voiceFetch === undefined ? {} : { fetch: options.voiceFetch }),
    ...(options.voiceLog === undefined ? {} : { log: options.voiceLog }),
  });
  const voiceSpeech: {
    speak?: Parameters<typeof createVoiceMessages>[0]['speak'];
  } = {};
  startup.enter('voice-messages', 'initialize');
  const voiceMessages = createVoiceMessages({
    providers: voiceProviders,
    bot: (slug) => voiceProviders.effective(registry.get(slug)),
    channels,
    attachments: () => attachments,
    speak: async (input) => voiceSpeech.speak?.(input),
    ...(options.voiceLog === undefined ? {} : { log: options.voiceLog }),
  });
  const voiceZoom: { zoom?: VoiceCalls['zoom'] | undefined } = {};
  return { voiceProviders, voiceMessages, voiceSpeech, voiceZoom };
}

export function mountCalls(
  ctx: Context,
  core: Pick<
    BotHarnessCore,
    'voiceProviders' | 'registry' | 'attachments' | 'channels' | 'voiceSpeech' | 'voiceZoom' | 'tob'
  >,
  modelCatalog: ReturnType<typeof createHostModelCatalog>['modelCatalog'],
  bridgeMethods: Pick<BridgeMethods, 'channelSend' | 'activityOverview'>,
  diagnosticEvents: DiagnosticEvents,
  media: NonNullable<Parameters<typeof createVoiceCalls>[0]['media']>,
  setCalls: (calls: VoiceCalls | undefined) => void,
  setDrafts: (drafts: (event: ChannelDraftEvent) => void) => void,
) {
  const calls = createVoiceCalls({
    bot: (slug) => core.voiceProviders.effective(core.registry.get(slug)),
    speechDbfs: () => core.voiceProviders.speechThreshold().dbfs,
    async seesImages(slug) {
      const route =
        core.registry.get(slug)?.modelPlan?.orchestrator ?? modelCatalog.defaultRoute?.();
      if (route === undefined) return true;
      const info = await ctx.llm.resolveModelInfo(route.provider, route.model);
      return info.inputModalities === undefined || info.inputModalities.includes('image');
    },
    providers: core.voiceProviders,
    media,
    async send({ channelId, messageId, body, callId, speech, visual }) {
      const { attachments, meta } = await callVisualMessage(core.attachments, messageId, visual);
      const result = await bridgeMethods.channelSend({
        channelId,
        messageId,
        body,
        ...(attachments === undefined ? {} : { attachments }),
        voiceCall: {
          callId,
          ...(speech === undefined ? {} : { speechFromMs: speech.fromMs, speechToMs: speech.toMs }),
          ...(meta === undefined ? {} : { visual: meta }),
        },
      });
      if (!result.ok)
        throw Object.assign(new Error(result.error.message), {
          code: result.error.code,
        });
    },
    async recordFrames({
      slug,
      channelId,
      callId,
      startedAt,
      source,
      image,
      frames,
      fromMs,
      toMs,
    }) {
      if (core.channels.get(channelId) === undefined) return undefined;
      const record = {
        callId,
        botSlug: slug,
        state: 'frames' as const,
        startedAt,
        source,
        frames,
        layout: image.layout,
        fromMs,
        toMs,
      };
      const attachment = await core.attachments.upload({
        data: (async function* () {
          yield image.jpeg;
        })(),
        name: `call-${source}-record-${Math.round(toMs / 1000)}s.jpg`,
      });
      const appended = await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channelId, {
        id: `voice-call-frames-${callId}-${toMs}`,
        at: voiceCallFramesAt(startedAt, toMs, Date.now()),
        author: { kind: 'system' },
        body: voiceCallRecordBody(record),
        attachments: [attachment],
        voiceCallRecord: record,
      });
      return appended?.id;
    },
    async record({ slug, channelId, record }) {
      const bot = core.registry.get(slug);
      if (core.channels.get(channelId) === undefined)
        core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, slug, bot?.displayName);
      const appended = await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channelId, {
        id:
          'atMs' in record
            ? `voice-call-${record.state}-${record.callId}-${record.atMs}`
            : `voice-call-${record.state}-${record.callId}`,
        at:
          record.state === 'started'
            ? record.startedAt
            : record.state === 'ended'
              ? record.endedAt
              : new Date(Date.parse(record.startedAt) + record.atMs).toISOString(),
        author: { kind: 'system' },
        body: voiceCallRecordBody(record),
        voiceCallRecord: record,
      });
      return appended?.id;
    },
    busy: (slug) => {
      const overview = bridgeMethods.activityOverview({});
      return (
        overview.ok &&
        overview.value.bots.some(
          (bot) =>
            bot.slug === slug && bot.sessions.some((session) => session.role === 'orchestrator'),
        )
      );
    },
    log: (phase, fields) => diagnosticEvents.record('voice', phase, fields),
  });
  setCalls(calls);
  core.voiceSpeech.speak = (input) => calls.speak(input);
  core.voiceZoom.zoom = (input) => calls.zoom(input);
  setDrafts((event) => calls.draft(event));
  ctx.effect(
    () => async () => {
      core.voiceSpeech.speak = undefined;
      core.voiceZoom.zoom = undefined;
      setDrafts(() => undefined);
      setCalls(undefined);
      await calls.dispose();
    },
    'botharness: voice calls',
  );
  const tobVoiceOperations = createTobVoiceOperations({
    providers: () => core.voiceProviders,
    registry: core.registry,
    isProtectedBot: (slug) => core.tob.isTob(slug),
  });
  return tobVoiceOperations;
}

export function mountFetch(
  connectionCtx: Context,
  fetch: {
    register(route: {
      path: string;
      methods: readonly 'POST'[];
      requestBody: 'buffered';
      fetch(request: Request): Promise<Response>;
    }): () => Promise<void>;
  },
  calls: () => VoiceCalls | undefined,
) {
  connectionCtx.effect(
    () =>
      fetch.register({
        path: VOICE_CALL_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: createVoiceCallHttp(calls),
      }),
    'botharness: Bot calls (Host owner and CLI)',
  );
}

export function localVoiceSkill() {
  return {
    name: LOCAL_VOICE_SKILL_NAME,
    description: LOCAL_VOICE_SKILL_DESCRIPTION,
    whenToUse: LOCAL_VOICE_SKILL_WHEN_TO_USE,
    content: LOCAL_VOICE_SKILL_CONTENT,
    invocation: LOCAL_VOICE_SKILL_INVOCATION,
    source: LOCAL_VOICE_SKILL_SOURCE,
    provider: LOCAL_VOICE_SKILL_PROVIDER,
  };
}
