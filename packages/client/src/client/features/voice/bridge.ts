import {
  addVoiceProvider as addVoiceProviderAnswer,
  browseVoiceCatalog as browseVoiceCatalogAnswer,
  importSharedVoice as importSharedVoiceAnswer,
  readVoiceProviders,
  removeVoiceService,
  setVoiceDefaultAnswer,
  testVoiceProvider as testVoiceProviderAnswer,
  voiceServiceRecord,
} from '@botharness/host-client/voice-providers';

import { BridgeCallError, bridgeHost, type BridgeCall } from '../../bridge-transport.js';
import type {
  AsrPresetView as AsrPreset,
  AsrProviderView,
  BotAsrView as PersonaBotAsr,
  BotVoiceView as PersonaBotVoice,
  VoiceDefaultsView as VoiceDefaults,
  VoiceSpeechThresholdView as VoiceSpeechThreshold,
  VoiceProviderHealthView as ProviderHealth,
  VoicePresetView as TtsPreset,
  VoiceProviderView as TtsProviderView,
  VoiceProvidersView,
  VoiceSynthesisView,
  VoiceCatalogImportInput,
  VoiceCatalogInput,
  VoiceCatalogItem,
  VoiceCatalogPage,
} from '../../voice-bridge.js';
import type {
  VoiceRequestTemplate,
  VoiceTemplateValidation,
} from '@botharness/host-protocol/voice-request-template';

export interface VoiceProviderAddInput {
  kind?: 'tts' | 'asr';
  preset: string;
  language?: string;
  name?: string;
  baseUrl?: string;
  model?: string;
  defaultVoice?: string;
  key?: string;
  template?: VoiceRequestTemplate;
}

export function createVoiceBridge(
  DEFAULT_SPEECH_DBFS: number,
  SPEECH_DBFS_RANGE: Readonly<{ min: number; max: number }>,
) {
  function record(value: unknown, method: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new Error(`invalid ${method} response`);
    return value as Record<string, unknown>;
  }

  async function unwrap(
    call: BridgeCall,
    method: string,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const result = await call(method, payload, signal);
    if (!result.ok)
      throw new BridgeCallError(result.error.code, result.error.message, result.error.details);
    return record(result.value, method);
  }

  async function browseVoiceCatalog(
    call: BridgeCall,
    input: VoiceCatalogInput,
    signal?: AbortSignal,
  ): Promise<VoiceCatalogPage> {
    return browseVoiceCatalogAnswer(bridgeHost(call, signal), input);
  }

  async function importSharedVoice(
    call: BridgeCall,
    input: VoiceCatalogImportInput,
  ): Promise<VoiceCatalogItem> {
    return importSharedVoiceAnswer(bridgeHost(call), input);
  }

  function provider(value: unknown, method: string): TtsProviderView {
    return voiceServiceRecord(value, method) as unknown as TtsProviderView;
  }

  function voice(value: unknown, method: string): PersonaBotVoice | null {
    if (value === null || value === undefined) return null;
    const view = record(value, method);
    if (typeof view['providerId'] !== 'string') throw new Error(`invalid ${method} response`);
    return {
      providerId: view['providerId'],
      ...(typeof view['voiceId'] === 'string' ? { voiceId: view['voiceId'] } : {}),
    } as PersonaBotVoice;
  }

  function asrBinding(value: unknown): PersonaBotAsr | null {
    if (typeof value !== 'object' || value === null) return null;
    const view = value as Record<string, unknown>;
    if (typeof view['providerId'] !== 'string') return null;
    return {
      providerId: view['providerId'],
      ...(typeof view['language'] === 'string' ? { language: view['language'] } : {}),
    };
  }

  function defaultsOf(value: unknown): VoiceDefaults {
    if (typeof value !== 'object' || value === null) return { tts: null, asr: null };
    const view = value as Record<string, unknown>;
    const tts = voice(view['tts'], 'voiceProviders');
    return {
      tts: tts === null ? null : { ...tts },
      asr: asrBinding(view['asr']),
    };
  }

  function thresholdOf(value: unknown): VoiceSpeechThreshold {
    const view =
      typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
    const number = (key: string, fallback: number) =>
      typeof view[key] === 'number' && Number.isFinite(view[key])
        ? (view[key] as number)
        : fallback;
    return {
      dbfs: number('dbfs', DEFAULT_SPEECH_DBFS),
      custom: view['custom'] === true,
      defaultDbfs: number('defaultDbfs', DEFAULT_SPEECH_DBFS),
      min: number('min', SPEECH_DBFS_RANGE.min),
      max: number('max', SPEECH_DBFS_RANGE.max),
    };
  }

  async function loadVoiceProviders(call: BridgeCall, slug?: string): Promise<VoiceProvidersView> {
    const view = await readVoiceProviders(bridgeHost(call), slug);
    const bot = view['bot'] === undefined ? undefined : record(view['bot'], 'voiceProviders');
    return {
      presets: view['presets'] as TtsPreset[],
      providers: (view['providers'] as unknown[]).map((entry) => provider(entry, 'voiceProviders')),
      asrPresets: Array.isArray(view['asrPresets']) ? (view['asrPresets'] as AsrPreset[]) : [],
      asrProviders: Array.isArray(view['asrProviders'])
        ? view['asrProviders'].map(
            (entry) => provider(entry, 'voiceProviders') as unknown as AsrProviderView,
          )
        : [],
      defaults: defaultsOf(view['defaults']),
      speechThreshold: thresholdOf(view['speechThreshold']),
      ...(bot === undefined || typeof bot['slug'] !== 'string'
        ? {}
        : {
            bot: {
              slug: bot['slug'],
              selected: voice(bot['selected'], 'voiceProviders'),
              asr: asrBinding(bot['asr']),
            },
          }),
    };
  }

  async function addVoiceProvider(
    call: BridgeCall,
    input: VoiceProviderAddInput,
  ): Promise<TtsProviderView> {
    return provider(
      await addVoiceProviderAnswer(bridgeHost(call), { ...input }),
      'voiceProviderAdd',
    );
  }

  function fields(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  function stringMap(value: unknown): boolean {
    const map = fields(value);
    return map !== undefined && Object.values(map).every((entry) => typeof entry === 'string');
  }

  function authOk(value: unknown): boolean {
    const auth = fields(value);
    if (auth?.['kind'] === 'none' || auth?.['kind'] === 'bearer') return true;
    if (auth?.['kind'] === 'query') return typeof auth['name'] === 'string';
    return (
      auth?.['kind'] === 'header' &&
      typeof auth['name'] === 'string' &&
      typeof auth['prefix'] === 'string'
    );
  }

  function ssmlOk(value: unknown, depth = 0): boolean {
    const node = fields(value);
    return (
      depth < 32 &&
      node !== undefined &&
      typeof node['tag'] === 'string' &&
      stringMap(node['attributes']) &&
      Array.isArray(node['children']) &&
      node['children'].every((child) => typeof child === 'string' || ssmlOk(child, depth + 1))
    );
  }

  function bodyOk(value: unknown): boolean {
    const body = fields(value);
    if (body?.['kind'] === 'none') return true;
    if (body?.['kind'] === 'json') return 'value' in body;
    if (body?.['kind'] === 'ssml') return ssmlOk(body['root']);
    return body?.['kind'] === 'multipart' && stringMap(body['fields']);
  }

  function resultOk(value: unknown): boolean {
    const result = fields(value);
    if (result?.['kind'] === 'audio') return true;
    return (
      ['base64', 'hex', 'url', 'text'].includes(result?.['kind'] as string) &&
      typeof result?.['path'] === 'string'
    );
  }

  function templateOf(value: unknown, method: string): VoiceRequestTemplate {
    const template = record(value, method);
    const headers = template['headers'];
    if (
      template['version'] !== 1 ||
      typeof template['url'] !== 'string' ||
      (template['method'] !== 'POST' && template['method'] !== 'GET') ||
      !stringMap(headers) ||
      !authOk(template['auth']) ||
      !bodyOk(template['body']) ||
      !resultOk(template['result'])
    )
      throw new Error(`invalid ${method} response`);
    return template as unknown as VoiceRequestTemplate;
  }

  async function validateVoiceTemplate(
    call: BridgeCall,
    kind: 'tts' | 'asr',
    template: unknown,
  ): Promise<VoiceTemplateValidation> {
    const method = 'voiceTemplateValidate';
    const view = await unwrap(call, method, { kind, template });
    if (view['valid'] === true)
      return { valid: true, template: templateOf(view['template'], method) };
    if (view['valid'] !== false || !Array.isArray(view['errors']))
      throw new Error(`invalid ${method} response`);
    return {
      valid: false,
      errors: view['errors'].map((entry) => {
        const error = record(entry, method);
        return {
          path: typeof error['path'] === 'string' ? error['path'] : '',
          message: typeof error['message'] === 'string' ? error['message'] : '',
        };
      }),
    };
  }

  async function voiceProviderTemplate(
    call: BridgeCall,
    id: string,
  ): Promise<VoiceRequestTemplate> {
    const method = 'voiceProviderTemplate';
    const view = await unwrap(call, method, { id });
    return templateOf(view['template'], method);
  }

  async function setVoiceProviderTemplate(
    call: BridgeCall,
    id: string,
    template: VoiceRequestTemplate,
  ): Promise<TtsProviderView> {
    const method = 'voiceProviderTemplateSet';
    const view = await unwrap(call, method, { id, template });
    return provider(view['provider'], method);
  }

  async function removeVoiceProvider(call: BridgeCall, id: string): Promise<string[]> {
    return removeVoiceService(bridgeHost(call), id);
  }

  async function testVoiceProvider(
    call: BridgeCall,
    id: string,
    voiceId?: string,
  ): Promise<ProviderHealth> {
    return (await testVoiceProviderAnswer(
      bridgeHost(call),
      id,
      voiceId,
    )) as unknown as ProviderHealth;
  }

  async function synthesizeVoice(
    call: BridgeCall,
    input: { text: string; slug?: string; providerId?: string; voiceId?: string },
  ): Promise<VoiceSynthesisView> {
    const view = await unwrap(call, 'voiceSynthesize', {
      ...input,
      markdown: true,
    });
    if (typeof view['audio'] !== 'string' || typeof view['mime'] !== 'string')
      throw new Error('invalid voiceSynthesize response');
    return view as unknown as VoiceSynthesisView;
  }

  async function setBotVoice(
    call: BridgeCall,
    slug: string,
    providerId: string | null,
    voiceId?: string,
  ): Promise<PersonaBotVoice | null> {
    const view = await unwrap(call, 'botVoiceSet', {
      slug,
      providerId,
      ...(voiceId === undefined ? {} : { voiceId }),
    });
    return voice(view['voice'], 'botVoiceSet');
  }

  async function setBotAsr(
    call: BridgeCall,
    slug: string,
    providerId: string | null,
  ): Promise<PersonaBotAsr | null> {
    const view = await unwrap(call, 'botAsrSet', { slug, providerId });
    return asrBinding(view['asr']);
  }

  async function setVoiceDefault(
    call: BridgeCall,
    kind: 'tts' | 'asr',
    providerId: string | null,
    voiceId?: string,
  ): Promise<VoiceDefaults> {
    return defaultsOf(await setVoiceDefaultAnswer(bridgeHost(call), kind, providerId, voiceId));
  }

  async function setSpeechThreshold(
    call: BridgeCall,
    dbfs: number | null,
  ): Promise<VoiceSpeechThreshold> {
    const view = await unwrap(call, 'voiceSpeechThresholdSet', { dbfs });
    return thresholdOf(view['speechThreshold']);
  }
  return {
    loadVoiceProviders,
    browseVoiceCatalog,
    importSharedVoice,
    addVoiceProvider,
    validateVoiceTemplate,
    voiceProviderTemplate,
    setVoiceProviderTemplate,
    removeVoiceProvider,
    testVoiceProvider,
    synthesizeVoice,
    setBotVoice,
    setBotAsr,
    setVoiceDefault,
    setSpeechThreshold,
  };
}
