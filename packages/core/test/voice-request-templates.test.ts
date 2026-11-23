import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createVoiceBridgeMethods } from '../src/voice/bridge.js';
import { VoiceProviders, MAX_TTS_AUDIO_BYTES, wavFromPcm16 } from '../src/voice/providers.js';
import {
  parseVoiceTemplate,
  validateVoiceTemplate,
  type VoiceRequestTemplate,
} from '../src/voice/request-template.js';
import { templateRequest } from '../src/voice/template-request.js';
import { templateAudio, templateResult } from '../src/voice/template-response.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';

const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 1)]);
const TEXT = 'Hello "friend" & <voice name="injected">世界</voice>\nGoodbye';
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const base: VoiceRequestTemplate = {
  version: 1,
  url: 'https://speech.example/speak',
  method: 'POST',
  auth: { kind: 'bearer' },
  headers: {},
  body: { kind: 'json', value: { text: '{text}' } },
  result: { kind: 'audio' },
};

async function fixture(fetcher: typeof fetch, timeoutMs?: number) {
  const root = createTempRoot('voice-templates-');
  const ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(root, '.credentials.yaml'),
    watch: false,
  });
  await fiber.await();
  const db = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  cleanup.push(() => fiber.dispose());
  const voiceDb = attachOperationalModule(db, 'voice');
  const providers = new VoiceProviders({
    database: voiceDb,
    credentials: () => ctx.credentials,
    fetch: fetcher,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  const registry = createTestRegistry({ rootDir: join(root, 'bots') });
  return { providers, db: voiceDb, methods: createVoiceBridgeMethods({ providers, registry }) };
}

const categories: {
  name: string;
  template: VoiceRequestTemplate;
  response: () => Response;
  request: unknown;
}[] = [
  {
    name: 'OpenAI speech',
    template: {
      ...base,
      url: 'https://api.openai.com/v1/audio/speech',
      body: {
        kind: 'json',
        value: { model: '{model}', input: '{text}', voice: '{voice}', response_format: 'mp3' },
      },
    },
    response: () => new Response(MP3),
    request: { model: 'tts-1', input: TEXT, voice: 'alloy', response_format: 'mp3' },
  },
  {
    name: 'ElevenLabs raw audio',
    template: {
      ...base,
      url: 'https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128',
      auth: { kind: 'header', name: 'xi-api-key', prefix: '' },
      body: { kind: 'json', value: { text: '{text}', model_id: '{model}' } },
    },
    response: () => new Response(MP3),
    request: { text: TEXT, model_id: 'tts-1' },
  },
  {
    name: 'MiMo chat audio',
    template: {
      ...base,
      url: 'https://api.xiaomimimo.com/v1/chat/completions',
      auth: { kind: 'header', name: 'api-key', prefix: '' },
      body: {
        kind: 'json',
        value: {
          model: 'mimo-v2.5-tts',
          messages: [{ role: 'assistant', content: '{text}' }],
          audio: { format: 'mp3', voice: '{voice}' },
        },
      },
      result: { kind: 'base64', path: 'choices.0.message.audio.data' },
    },
    response: () =>
      Response.json({ choices: [{ message: { audio: { data: MP3.toString('base64') } } }] }),
    request: {
      model: 'mimo-v2.5-tts',
      messages: [{ role: 'assistant', content: TEXT }],
      audio: { format: 'mp3', voice: 'alloy' },
    },
  },
  {
    name: 'Google base64 field',
    template: {
      ...base,
      url: 'https://texttospeech.googleapis.com/v1/text:synthesize',
      auth: { kind: 'query', name: 'key' },
      body: {
        kind: 'json',
        value: {
          input: { text: '{text}' },
          voice: { languageCode: 'en-US', name: '{voice}' },
          audioConfig: { audioEncoding: 'MP3' },
        },
      },
      result: { kind: 'base64', path: 'audioContent' },
    },
    response: () => Response.json({ audioContent: MP3.toString('base64') }),
    request: {
      input: { text: TEXT },
      voice: { languageCode: 'en-US', name: 'alloy' },
      audioConfig: { audioEncoding: 'MP3' },
    },
  },
  {
    name: 'MiniMax hex field',
    template: {
      ...base,
      url: 'https://api.minimax.io/v1/t2a_v2',
      body: {
        kind: 'json',
        value: {
          model: 'speech-2.8-hd',
          text: '{text}',
          stream: false,
          voice_setting: { voice_id: '{voice}' },
          audio_setting: { format: 'mp3' },
          output_format: 'hex',
        },
      },
      result: { kind: 'hex', path: 'data.audio' },
    },
    response: () => Response.json({ data: { audio: MP3.toString('hex') } }),
    request: {
      model: 'speech-2.8-hd',
      text: TEXT,
      stream: false,
      voice_setting: { voice_id: 'alloy' },
      audio_setting: { format: 'mp3' },
      output_format: 'hex',
    },
  },
  {
    name: 'DashScope URL result',
    template: {
      ...base,
      url: 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      body: {
        kind: 'json',
        value: {
          model: 'qwen3-tts-flash',
          input: { text: '{text}', voice: 'Cherry', language_type: 'English' },
        },
      },
      result: { kind: 'url', path: 'output.audio.url' },
    },
    response: () =>
      Response.json({ output: { audio: { url: 'https://audio.example/one.mp3?signed=value' } } }),
    request: {
      model: 'qwen3-tts-flash',
      input: { text: TEXT, voice: 'Cherry', language_type: 'English' },
    },
  },
];

describe('HTTP voice request templates', () => {
  it.each(categories)(
    'runs $name through the persisted custom Provider',
    async ({ template, response, request }) => {
      const seen: { url: string; init: RequestInit | undefined }[] = [];
      const f = await fixture(async (url, init) => {
        seen.push({ url: String(url), init });
        return seen.length === 1 ? response() : new Response(MP3);
      });
      const provider = await f.providers.add({
        preset: 'custom',
        template,
        defaultVoice: 'alloy',
        key: 'fixture-secret-123',
      });
      expect(f.providers.template(provider.id)).toEqual(template);
      expect(f.providers.get(provider.id)).not.toHaveProperty('template');
      const synthesized = await f.providers.synthesize({ providerId: provider.id, text: TEXT });
      expect(synthesized.mime).toBe('audio/mpeg');
      expect(Buffer.from(synthesized.audio)).toEqual(MP3);
      expect(JSON.parse(String(seen[0]?.init?.body))).toEqual(request);
      const auth = template.auth;
      if (auth.kind === 'query')
        expect(new URL(seen[0]!.url).searchParams.get(auth.name)).toBe('fixture-secret-123');
      else
        expect(
          new Headers(seen[0]?.init?.headers).get(
            auth.kind === 'header' ? auth.name : 'Authorization',
          ),
        ).toBe(auth.kind === 'header' ? 'fixture-secret-123' : 'Bearer fixture-secret-123');
      expect(seen).toHaveLength(template.result.kind === 'url' ? 2 : 1);
      if (seen[1]) {
        expect(seen[1].init?.headers).toBeUndefined();
        expect(seen[1].init?.redirect).toBe('error');
        expect(seen[1].init?.signal).toBe(seen[0]?.init?.signal);
      }
      const rows = f.db.read((db) => db.prepare('SELECT body FROM voice_providers').all());
      expect(JSON.stringify(rows)).not.toContain('fixture-secret-123');
    },
  );

  it('serializes Azure SSML nodes with escaped text and attributes', async () => {
    const template = parseVoiceTemplate(
      {
        ...base,
        url: 'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1',
        auth: { kind: 'header', name: 'Ocp-Apim-Subscription-Key', prefix: '' },
        headers: {
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'BotHarness',
        },
        body: {
          kind: 'ssml',
          root: {
            tag: 'speak',
            attributes: {
              version: '1.0',
              xmlns: 'http://www.w3.org/2001/10/synthesis',
              'xml:lang': 'en-US',
            },
            children: [{ tag: 'voice', attributes: { name: '{voice}' }, children: ['{text}'] }],
          },
        },
      },
      'tts',
    );
    let sent: RequestInit | undefined;
    const f = await fixture(async (_url, init) => {
      sent = init;
      return new Response(MP3);
    });
    const provider = await f.providers.add({
      preset: 'custom',
      template,
      defaultVoice: 'en-US-ChristopherNeural',
      key: 'azure-fixture-secret',
    });
    await f.providers.synthesize({ providerId: provider.id, text: TEXT });
    expect(sent?.body).toContain('xmlns="http://www.w3.org/2001/10/synthesis"');
    expect(sent?.body).toContain('&lt;voice name=&quot;injected&quot;&gt;');
    expect(sent?.body).not.toContain('<voice name="injected">');
    expect(new Headers(sent?.headers).get('content-type')).toBe('application/ssml+xml');
  });

  it('sends ASR multipart audio and extracts a nested transcript', async () => {
    let sent: RequestInit | undefined;
    const f = await fixture(async (_url, init) => {
      sent = init;
      return Response.json({ result: { text: '  heard\nwords ' } });
    });
    const audio = wavFromPcm16(new Int16Array([0, 100, 0]), 16_000);
    const template = parseVoiceTemplate(
      {
        ...base,
        body: {
          kind: 'multipart',
          fields: { file: '{audio}', model: '{model}', language: '{language}' },
        },
        result: { kind: 'text', path: 'result.text' },
      },
      'asr',
    );
    const provider = await f.providers.add({ kind: 'asr', preset: 'custom', template });
    expect(
      await f.providers.transcribe({ providerId: provider.id, audio, language: 'en-US' }),
    ).toMatchObject({ text: 'heard words' });
    expect(sent?.body).toBeInstanceOf(FormData);
    if (!(sent?.body instanceof FormData)) throw new Error('Expected multipart');
    const file = sent.body.get('file');
    expect(file).toBeInstanceOf(Blob);
    if (!(file instanceof Blob)) throw new Error('Expected audio');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio);
    expect(sent.body.get('language')).toBe('en-US');
    expect(new Headers(sent.headers).has('content-type')).toBe(false);
  });

  it('supports GET, encoded URL values, auth prefixes and JSON audio placeholders', () => {
    const get = parseVoiceTemplate(
      {
        ...base,
        method: 'GET',
        url: 'https://speech.example/{voice}?text={text}',
        body: { kind: 'none' },
        auth: { kind: 'header', name: 'X-API-Key', prefix: 'Token ' },
      },
      'tts',
    );
    const request = templateRequest(get, { voice: 'a/b', text: 'x&other=bad' }, 'secret');
    expect(new URL(request.url).pathname).toBe('/a%2Fb');
    expect(new URL(request.url).searchParams.get('text')).toBe('x&other=bad');
    expect(new Headers(request.init.headers).get('X-API-Key')).toBe('Token secret');
    expect(request.init.body).toBeUndefined();
    const json = templateRequest(
      { ...base, body: { kind: 'json', value: { data: '{audio}' } } },
      { audio: MP3 },
      undefined,
    );
    expect(JSON.parse(String(json.init.body))).toEqual({ data: MP3.toString('base64') });
  });

  it('exposes field validation, template readback and custom-only edits without storing keys', async () => {
    const f = await fixture(async () => new Response(MP3));
    const bad = f.methods.voiceTemplateValidate({
      kind: 'tts',
      template: { ...base, result: { kind: 'base64', path: '$.missing' } },
    });
    expect(bad).toMatchObject({
      ok: true,
      value: { valid: false, errors: [{ path: 'result.path' }] },
    });
    const custom = await f.providers.add({
      preset: 'custom',
      template: base,
      key: 'owner-secret-123',
    });
    const updated = await f.methods.voiceProviderTemplateSet({
      id: custom.id,
      template: {
        ...base,
        url: 'https://edited.example/speak',
        method: 'GET',
        body: { kind: 'none' },
      },
    });
    expect(updated).toMatchObject({
      ok: true,
      value: { provider: { baseUrl: 'https://edited.example', hasTemplate: true } },
    });
    expect(f.methods.voiceProviderTemplate({ id: custom.id })).toMatchObject({
      ok: true,
      value: { template: { method: 'GET' } },
    });
    await expect(
      f.providers.setTemplate(custom.id, {
        ...base,
        url: 'https://speech.example/?key=owner-secret-123',
      }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    const local = await f.providers.add({ preset: 'local' });
    await expect(f.providers.setTemplate(local.id, base)).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await expect(
      f.providers.add({
        preset: 'custom',
        template: { ...base, headers: { 'X-Extra': 'owner-secret-123' } },
        key: 'owner-secret-123',
      }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
  });

  it.each([
    { ...base, url: 'file:///tmp/audio' },
    { ...base, url: 'https://user:secret@speech.example/' },
    { ...base, body: { kind: 'json', value: { text: '{secret}' } } },
    { ...base, method: 'GET' },
    { ...base, headers: { Authorization: 'literal-secret' } },
    { ...base, headers: { 'X-Extra': 'invalid\r\nvalue' } },
    { ...base, key: 'literal-secret' },
    { ...base, result: { kind: 'text', path: 'text' } },
  ])('rejects invalid or credential-bearing templates %#', (template) => {
    expect(validateVoiceTemplate(template, 'tts').valid).toBe(false);
  });

  it('returns a coded error for header placeholders that render invalid bytes', () => {
    expect(() =>
      templateRequest(
        { ...base, headers: { 'X-Language': '{language}' } },
        { language: 'en\r\nsecret' },
        undefined,
      ),
    ).toThrow(expect.objectContaining({ code: 'invalid-input' }));
  });

  it('refuses templates that can change the authority or exceed the bounded grammar', () => {
    expect(
      validateVoiceTemplate({ ...base, url: 'https://{voice}.example/speak' }, 'tts').valid,
    ).toBe(false);
    expect(
      validateVoiceTemplate({ ...base, auth: { kind: 'header', name: 'Host', prefix: '' } }, 'tts')
        .valid,
    ).toBe(false);
    let value: unknown = 'text';
    for (let depth = 0; depth < 30; depth += 1) value = { nested: value };
    expect(validateVoiceTemplate({ ...base, body: { kind: 'json', value } }, 'tts').valid).toBe(
      false,
    );
    expect(
      validateVoiceTemplate({ ...base, body: { kind: 'json', value: 'x'.repeat(65_536) } }, 'tts')
        .valid,
    ).toBe(false);
  });

  it.each([
    {
      response: () => Response.json({ missing: 'private upstream detail' }),
      result: { kind: 'base64', path: 'audio' },
    },
    {
      response: () => Response.json({ audio: 'private upstream detail' }),
      result: { kind: 'base64', path: 'audio' },
    },
    ...['audio', 'base64'].map((kind) => ({
      response: () =>
        new Response('<html>private upstream detail</html>', {
          headers: { 'Content-Type': 'text/html' },
        }),
      result:
        kind === 'audio' ? { kind: 'audio' as const } : { kind: 'base64' as const, path: 'audio' },
    })),
    {
      response: () => new Response('<html>private upstream detail</html>'),
      result: { kind: 'audio' },
    },
  ] satisfies { response: () => Response; result: VoiceRequestTemplate['result'] }[])(
    'refuses missing paths, malformed audio and HTML without echoing upstream content %#',
    async ({ response, result }) => {
      const error = await templateAudio({
        response: response(),
        result,
        fetch,
        signal: AbortSignal.timeout(1_000),
      }).catch((error: unknown) => error);
      expect(error).toMatchObject({ code: 'provider-bad-response' });
      expect(String(error)).not.toContain('private upstream detail');
    },
  );

  it('bounds encoded audio and downloaded audio, and follows no second URL', async () => {
    await expect(
      templateAudio({
        response: Response.json({ audio: 'x'.repeat(MAX_TTS_AUDIO_BYTES * 2 + 1) }),
        result: { kind: 'hex', path: 'audio' },
        fetch,
        signal: AbortSignal.timeout(1_000),
      }),
    ).rejects.toMatchObject({ code: 'audio-too-large' });
    let downloads = 0;
    await expect(
      templateAudio({
        response: Response.json({ audio: 'https://audio.example/one' }),
        result: { kind: 'url', path: 'audio' },
        fetch: async () => {
          downloads += 1;
          return Response.json({ audio: 'https://audio.example/two' });
        },
        signal: AbortSignal.timeout(1_000),
      }),
    ).rejects.toMatchObject({ code: 'provider-bad-response' });
    expect(downloads).toBe(1);
    await expect(
      templateAudio({
        response: Response.json({ audio: 'https://audio.example/one' }),
        result: { kind: 'url', path: 'audio' },
        fetch: async () =>
          new Response(MP3, { headers: { 'Content-Length': String(MAX_TTS_AUDIO_BYTES + 1) } }),
        signal: AbortSignal.timeout(1_000),
      }),
    ).rejects.toMatchObject({ code: 'audio-too-large' });
    expect(() => templateResult({}, '__proto__.secret')).toThrow('result path');
  });

  it('does not return upstream error bodies, including successful non-audio download bodies', async () => {
    const f = await fixture(
      async () => new Response('private upstream detail owner-secret-123', { status: 400 }),
    );
    const custom = await f.providers.add({
      preset: 'custom',
      template: base,
      key: 'owner-secret-123',
    });
    expect(await f.providers.test(custom.id)).toMatchObject({
      ok: false,
      code: 'provider-rejected',
      message: 'The provider rejected the request: HTTP 400',
    });
    expect(JSON.stringify(await f.providers.test(custom.id))).not.toContain(
      'private upstream detail',
    );
  });
  it.each(['custom', 'fish-audio', 'elevenlabs', 'xiaomi-mimo'])(
    'sends configured %s model and voice values literally',
    async (preset) => {
      let sent: RequestInit | undefined;
      const f = await fixture(async (_url, init) => {
        sent = init;
        return preset === 'xiaomi-mimo'
          ? Response.json({ choices: [{ message: { audio: { data: MP3.toString('base64') } } }] })
          : new Response(MP3);
      });
      const model = 'adapter-{text}-{voice}';
      const voice = 'speaker-{text}';
      const provider = await f.providers.add({
        preset,
        baseUrl: 'https://speech.example',
        model,
        defaultVoice: voice,
        key: 'fixture-secret',
      });
      await f.providers.synthesize({ providerId: provider.id, text: 'utterance' });
      if (preset === 'fish-audio') expect(new Headers(sent?.headers).get('model')).toBe(model);
      else
        expect(JSON.parse(String(sent?.body))).toMatchObject(
          preset === 'elevenlabs' ? { model_id: model } : { model },
        );
      if (preset === 'custom') expect(JSON.parse(String(sent?.body))).toMatchObject({ voice });
    },
  );

  it('sends a configured ASR model literally and omits templates from both lists', async () => {
    let sent: RequestInit | undefined;
    const f = await fixture(async (_url, init) => {
      sent = init;
      return Response.json({ text: 'heard' });
    });
    const provider = await f.providers.add({
      kind: 'asr',
      preset: 'custom',
      baseUrl: 'https://speech.example',
      model: 'adapter-{text}',
    });
    await f.providers.transcribe({
      providerId: provider.id,
      audio: wavFromPcm16(new Int16Array([1]), 16_000),
    });
    expect(sent?.body).toBeInstanceOf(FormData);
    if (!(sent?.body instanceof FormData)) throw new Error('Expected multipart');
    expect(sent.body.get('model')).toBe('adapter-{text}');
    const asr = parseVoiceTemplate(
      {
        ...base,
        body: { kind: 'multipart', fields: { file: '{audio}' } },
        result: { kind: 'text', path: 'text' },
      },
      'asr',
    );
    const custom = await f.providers.add({ kind: 'asr', preset: 'custom', template: asr });
    await f.providers.add({ preset: 'custom', template: base });
    const listed = f.methods.voiceProviders({});
    expect(JSON.stringify(listed)).not.toContain('"template"');
    expect(f.providers.listAsr().find(({ id }) => id === custom.id)).toMatchObject({
      hasTemplate: true,
    });
    expect(f.providers.template(custom.id)).toEqual(asr);
  });

  it('rejects a raw template that becomes oversized only after normalization on every write path', async () => {
    const { headers: _headers, ...scaffold } = { ...base, body: { kind: 'json', value: '' } };
    const available = 65_530 - Buffer.byteLength(JSON.stringify(scaffold), 'utf8');
    const input = {
      ...scaffold,
      body: {
        kind: 'json',
        value: '界'.repeat(Math.floor(available / 3)) + 'x'.repeat(available % 3),
      },
    };
    expect(Buffer.byteLength(JSON.stringify(input), 'utf8')).toBe(65_530);
    expect(Buffer.byteLength(JSON.stringify({ ...input, headers: {} }), 'utf8')).toBeGreaterThan(
      65_536,
    );
    expect(validateVoiceTemplate(input, 'tts').valid).toBe(false);
    const f = await fixture(async () => new Response(MP3));
    expect(f.methods.voiceTemplateValidate({ kind: 'tts', template: input })).toMatchObject({
      ok: true,
      value: { valid: false },
    });
    expect(await f.methods.voiceProviderAdd({ preset: 'custom', template: input })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    const custom = await f.providers.add({ preset: 'custom', template: base });
    expect(
      await f.methods.voiceProviderTemplateSet({ id: custom.id, template: input }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(f.providers.template(custom.id)).toEqual(base);
    expect(f.providers.list()).toHaveLength(1);
  });

  it.each([
    'https:////{voice}.example/speak',
    'https:\\\\{voice}.example/speak',
    'https://speech.example\\{voice}.example/speak',
    'https://speech.example/\n{voice}',
  ])('rejects ambiguous URL authorities before credentials can be attached: %s', (url) => {
    const template = { ...base, url };
    expect(validateVoiceTemplate(template, 'tts').valid).toBe(false);
    expect(() => templateRequest(template, { voice: 'attacker' }, 'secret')).toThrow();
  });

  it.each(['\u0000', '\u001f', '\u007f', '世界', '\r', '\n'])(
    'rejects invalid fixed header bytes and auth prefixes %#',
    (value) => {
      expect(validateVoiceTemplate({ ...base, headers: { 'X-Label': value } }, 'tts').valid).toBe(
        false,
      );
      expect(
        validateVoiceTemplate(
          { ...base, auth: { kind: 'header', name: 'X-API-Key', prefix: value } },
          'tts',
        ).valid,
      ).toBe(false);
    },
  );

  it.each<VoiceRequestTemplate['body']>([
    { kind: 'json', value: {} },
    { kind: 'ssml', root: { tag: 'speak', attributes: {}, children: [] } },
    { kind: 'multipart', fields: {} },
  ])('rejects Content-Type authentication for managed body %#', (body) => {
    expect(
      validateVoiceTemplate(
        { ...base, body, auth: { kind: 'header', name: 'cOnTeNt-TyPe', prefix: '' } },
        'tts',
      ).valid,
    ).toBe(false);
    expect(
      validateVoiceTemplate(
        { ...base, body, auth: { kind: 'header', name: 'X-API-Key', prefix: '' } },
        'tts',
      ).valid,
    ).toBe(true);
  });

  it('validates placeholders by provider kind while allowing optional ASR language', () => {
    for (const value of ['{text}', 'prefix {voice}'])
      expect(
        validateVoiceTemplate(
          { ...base, body: { kind: 'json', value }, result: { kind: 'text', path: 'text' } },
          'asr',
        ).valid,
      ).toBe(false);
    expect(
      validateVoiceTemplate(
        {
          ...base,
          body: { kind: 'multipart', fields: { language: '{language}', file: '{audio}' } },
          result: { kind: 'text', path: 'text' },
        },
        'asr',
      ).valid,
    ).toBe(true);
    expect(
      validateVoiceTemplate({ ...base, body: { kind: 'json', value: '{audio}' } }, 'tts').valid,
    ).toBe(false);
  });

  it('bounds cumulative audio expansion before encoding or copying', () => {
    const audio = new Uint8Array(8 * 1024 * 1024);
    const encoder = vi.spyOn(Buffer, 'from');
    for (const body of [
      { kind: 'json', value: ['{audio}', '{audioBase64}'] },
      { kind: 'multipart', fields: { one: '{audio}', two: '{audio}', three: '{audio}' } },
    ] satisfies VoiceRequestTemplate['body'][]) {
      expect(() => templateRequest({ ...base, body }, { audio }, undefined)).toThrow(
        expect.objectContaining({ code: 'invalid-input' }),
      );
    }
    expect(encoder).not.toHaveBeenCalled();
    encoder.mockRestore();
    expect(
      templateRequest(
        { ...base, body: { kind: 'multipart', fields: { file: '{audio}' } } },
        { audio },
        undefined,
      ).init.body,
    ).toBeInstanceOf(FormData);
  });

  it.each(['timeout', 'cancellation'])(
    'preserves %s while reading a successful JSON response body',
    async (kind) => {
      const controller = new AbortController();
      const reason = new Error('caller stopped');
      const f = await fixture(async (_url, init) => {
        const signal = init?.signal;
        if (signal === undefined || signal === null) throw new Error('Missing signal');
        return new Response(
          new ReadableStream({
            start(stream) {
              signal.addEventListener('abort', () => stream.error(signal.reason), { once: true });
              if (kind === 'cancellation') controller.abort(reason);
            },
          }),
        );
      }, 30);
      const custom = await f.providers.add({
        preset: 'custom',
        template: { ...base, result: { kind: 'base64', path: 'audio' } },
      });
      const synthesis = f.providers.synthesize({
        providerId: custom.id,
        text: 'hello',
        signal: controller.signal,
      });
      if (kind === 'timeout')
        await expect(synthesis).rejects.toMatchObject({ code: 'provider-timeout' });
      else await expect(synthesis).rejects.toBe(reason);
    },
  );
});
