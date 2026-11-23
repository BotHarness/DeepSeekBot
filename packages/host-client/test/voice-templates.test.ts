import { describe, expect, it, vi } from 'vitest';

import type { VoiceRequestTemplate } from '@botharness/host-protocol/voice-request-template';

import { HostAnswerInvalid } from '../src/host-answer';
import { blankDraft, checkTemplate, draftFromTemplate } from '../src/shared/voice-template-draft';
import { BLANK_EXAMPLE, exampleStart, examplesFor } from '../src/shared/voice-template-examples';
import { loadVoiceServices } from '../src/voice-providers';
import {
  isVoiceTemplate,
  readVoiceServiceTemplate,
  setVoiceServiceTemplate,
  validateVoiceTemplate,
  voiceTemplateOf,
} from '../src/voice-templates';

const TEMPLATE: VoiceRequestTemplate = {
  version: 1,
  url: 'https://tts.example/v1/speak',
  method: 'POST',
  auth: { kind: 'query', name: 'key' },
  headers: {},
  body: { kind: 'json', value: { text: '{text}' } },
  result: { kind: 'base64', path: 'audio' },
};

const MESSAGES = { invalidJson: 'bad json', expectObject: 'need object' };

function host(answer: unknown) {
  return { call: vi.fn(async (_method: string, _args?: Record<string, unknown>) => answer) };
}

describe('voice template readers', () => {
  it('validates through the Host and keeps refusals as field paths', async () => {
    const ok = host({ valid: true, template: TEMPLATE });
    await expect(validateVoiceTemplate(ok, 'tts', TEMPLATE)).resolves.toEqual({
      valid: true,
      template: TEMPLATE,
    });
    expect(ok.call).toHaveBeenCalledWith('voiceTemplateValidate', {
      kind: 'tts',
      template: TEMPLATE,
    });
    const refused = host({ valid: false, errors: [{ path: 'url', message: 'Use https.' }] });
    await expect(validateVoiceTemplate(refused, 'asr', {})).resolves.toEqual({
      valid: false,
      errors: [{ path: 'url', message: 'Use https.' }],
    });
  });

  it('rejects a malformed template answer', async () => {
    await expect(
      readVoiceServiceTemplate(host({ template: { ...TEMPLATE, method: 'PUT' } }), 'tts-1'),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
    await expect(validateVoiceTemplate(host({ valid: 'yes' }), 'tts', {})).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
  });

  it('accepts only JSON values in a json body', () => {
    const withBody = (value: unknown) => ({ ...TEMPLATE, body: { kind: 'json', value } });
    const nested = (levels: number): unknown =>
      levels === 0 ? 'leaf' : { next: nested(levels - 1) };
    expect(
      isVoiceTemplate(withBody({ a: [1, 'two', true, null, { b: -0.5 }], c: Object.create(null) })),
    ).toBe(true);
    expect(isVoiceTemplate(withBody(nested(31)))).toBe(true);
    for (const value of [
      { text: () => 'x' },
      { text: undefined },
      { at: new Date(0) },
      [Number.NaN],
      { big: Number.POSITIVE_INFINITY },
      nested(32),
    ])
      expect(isVoiceTemplate(withBody(value))).toBe(false);
    expect(() => voiceTemplateOf(withBody({ at: new Date(0) }), 'voiceProviderTemplate')).toThrow(
      HostAnswerInvalid,
    );
  });

  it('reads and saves a service template', async () => {
    const read = host({ template: TEMPLATE });
    await expect(readVoiceServiceTemplate(read, 'tts-1')).resolves.toEqual(TEMPLATE);
    expect(read.call).toHaveBeenCalledWith('voiceProviderTemplate', { id: 'tts-1' });
    const saved = host({
      provider: {
        id: 'tts-1',
        name: 'Custom',
        preset: 'custom',
        baseUrl: 'https://tts.example',
        keySet: true,
        hasTemplate: true,
      },
    });
    await expect(setVoiceServiceTemplate(saved, 'tts-1', TEMPLATE)).resolves.toMatchObject({
      id: 'tts-1',
      hasTemplate: true,
    });
    expect(saved.call).toHaveBeenCalledWith('voiceProviderTemplateSet', {
      id: 'tts-1',
      template: TEMPLATE,
    });
  });

  it('marks services that carry a template', async () => {
    const view = await loadVoiceServices(
      host({
        presets: [],
        providers: [
          { id: 'a', name: 'A', preset: 'custom', baseUrl: 'x', keySet: false, hasTemplate: true },
          { id: 'b', name: 'B', preset: 'openai', baseUrl: 'y', keySet: true },
        ],
      }),
    );
    expect(view.providers.map((service) => service.hasTemplate)).toEqual([true, undefined]);
  });
});

describe('shared template draft', () => {
  it('starts from an example or a blank draft', () => {
    const whisper = exampleStart('asr', 'whisper');
    expect(whisper).toMatchObject({ example: 'whisper', model: 'whisper-1', voice: '' });
    expect(whisper.template.bodyKind).toBe('multipart');
    expect(exampleStart('tts', 'missing')).toEqual({
      example: BLANK_EXAMPLE,
      template: blankDraft('tts'),
      model: '',
      voice: '',
    });
    expect(examplesFor('tts').every((example) => example.kind === 'tts')).toBe(true);
  });

  it('stops local JSON errors before asking the Host', async () => {
    const validate = vi.fn();
    const draft = { ...draftFromTemplate(TEMPLATE), headers: '{', body: '[1]' };
    await expect(checkTemplate(validate, 'tts', draft, MESSAGES)).resolves.toEqual({
      ok: false,
      errors: { headers: 'bad json' },
    });
    expect(validate).not.toHaveBeenCalled();
  });

  it('maps Host refusals onto fields and returns the normalized template', async () => {
    const draft = draftFromTemplate(TEMPLATE);
    await expect(
      checkTemplate(
        async () => ({ valid: false, errors: [{ path: 'result.path', message: 'Required.' }] }),
        'tts',
        draft,
        MESSAGES,
      ),
    ).resolves.toEqual({ ok: false, errors: { resultPath: 'result.path: Required.' } });
    await expect(
      checkTemplate(async () => ({ valid: true, template: TEMPLATE }), 'tts', draft, MESSAGES),
    ).resolves.toEqual({ ok: true, template: TEMPLATE });
  });
});
