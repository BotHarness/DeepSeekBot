// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const team = vi.hoisted(() => ({ member: false }));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return new Proxy(
    {},
    {
      get: (_target, key) => (key === 'then' ? undefined : stub),
      has: () => true,
    },
  );
});

vi.mock('../src/client/team-state.js', async (original) => ({
  ...(await original<typeof import('../src/client/team-state.js')>()),
  useTeamMember: () => team.member,
}));

import { zhTranslate } from '../src/client/locale.js';
import { VoiceProviderSettings } from '../src/client/voice-settings.js';
import { TemplateEditDialog } from '../src/client/features/voice/template-edit-dialog.js';
import {
  blankDraft,
  buildTemplate,
  draftFromTemplate,
  fieldOf,
  templateErrors,
} from '../src/client/features/voice/template-draft.js';
import { TEMPLATE_EXAMPLES } from '../src/client/features/voice/template-examples.js';
import type { VoiceRequestTemplate } from '@botharness/host-protocol/voice-request-template';

const MESSAGES = { invalidJson: 'bad json', expectObject: 'need object' };

const VIEW = {
  presets: [
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyRequired: true },
  ],
  providers: [],
  asrPresets: [
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyRequired: true },
  ],
  asrProviders: [],
  defaults: { tts: null, asr: null },
  speechThreshold: { dbfs: -45, custom: false, defaultDbfs: -45, min: -70, max: -20 },
};

const TEMPLATE: VoiceRequestTemplate = {
  version: 1,
  url: 'https://tts.example/v1/speak',
  method: 'POST',
  auth: { kind: 'header', name: 'X-API-Key', prefix: 'Token ' },
  headers: { Accept: 'audio/mpeg' },
  body: { kind: 'json', value: { text: '{text}' } },
  result: { kind: 'base64', path: 'data.audio' },
};

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  team.member = false;
});

async function render(element: ReturnType<typeof createElement>): Promise<void> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
}

function type(selector: string, value: string): void {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (input === null) throw new Error(`missing ${selector}`);
  const proto = Object.getPrototypeOf(input) as object;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function fieldText(selector: string): string {
  return document.querySelector(selector)?.closest('div')?.textContent ?? '';
}

async function click(element: Element | null | undefined): Promise<void> {
  if (element === null || element === undefined) throw new Error('missing element');
  await act(async () => {
    (element as HTMLElement).click();
  });
}

function pickerOption(id: string): Element | undefined {
  return [...document.querySelectorAll('[data-picker-option]')].find(
    (option) => option.getAttribute('data-picker-option') === id,
  );
}

async function openCustom(kind: 'tts' | 'asr'): Promise<void> {
  await vi.waitFor(() =>
    expect(document.querySelector(`[data-voice-provider-new="${kind}"]`)).not.toBeNull(),
  );
  await click(
    document.querySelector(`[data-voice-provider-new="${kind}"]`)?.querySelector('button') ??
      document.querySelector(`[data-voice-provider-new="${kind}"]`),
  );
  await click(document.querySelector('[role="dialog"] button[aria-haspopup="dialog"]'));
}

describe('voice template drafts', () => {
  it('round-trips every starting example through the editable draft', () => {
    for (const example of TEMPLATE_EXAMPLES) {
      const built = buildTemplate(draftFromTemplate(example.template), MESSAGES);
      expect(built).toEqual({ ok: true, template: example.template });
    }
  });

  it('reports malformed JSON per field without sending a template', () => {
    const draft = {
      ...blankDraft('tts'),
      headers: '{nope',
      body: '[1]',
      bodyKind: 'ssml' as const,
    };
    expect(buildTemplate(draft, MESSAGES)).toEqual({
      ok: false,
      errors: { headers: 'bad json', body: 'need object' },
    });
  });

  it('maps validation paths onto form fields', () => {
    expect(fieldOf('auth.name')).toBe('authName');
    expect(fieldOf('result.path')).toBe('resultPath');
    expect(fieldOf('body.value.input')).toBe('body');
    expect(fieldOf('')).toBe('form');
    expect(
      templateErrors([
        { path: 'url', message: 'Use an HTTP(S) URL.' },
        { path: 'headers.Authorization', message: 'Use auth.' },
        { path: '', message: 'Too big.' },
      ]),
    ).toEqual({
      url: 'Use an HTTP(S) URL.',
      headers: 'Authorization: Use auth.',
      form: 'Too big.',
    });
  });
});

describe('custom request form', () => {
  it('validates, shows field errors, then adds a custom TTS provider with the key outside the template', async () => {
    const validateVoiceTemplate = vi
      .fn()
      .mockResolvedValueOnce({
        valid: false,
        errors: [{ path: 'url', message: 'Use an HTTP(S) URL without credentials or fragment.' }],
      })
      .mockImplementation(async (_kind: string, template: VoiceRequestTemplate) => ({
        valid: true,
        template,
      }));
    const addVoiceProvider = vi.fn(async () => ({
      id: 'p1',
      name: 'Custom request',
      preset: 'custom',
      baseUrl: 'https://tts.example',
      keySet: true,
    }));
    const testVoiceProvider = vi.fn(async () => ({ ok: true, providerId: 'p1', latencyMs: 5 }));
    await render(
      createElement(VoiceProviderSettings, {
        actions: {
          voiceProviders: vi.fn(async () => VIEW),
          addVoiceProvider,
          testVoiceProvider,
          validateVoiceTemplate,
          voiceProviderTemplate: vi.fn(),
          setVoiceProviderTemplate: vi.fn(),
        } as never,
        t: zhTranslate,
      }),
    );
    await openCustom('tts');
    await click(pickerOption('\u0000template'));
    expect(document.querySelector('[data-voice-template-url]')).not.toBeNull();
    expect(document.querySelector('[data-voice-template-body]')?.textContent).toContain('{text}');
    type('[data-voice-template-url]', 'ftp://tts.example/v1/speak');
    type('input[type="password"]', 'secret-key-123');
    await click(document.querySelector('[data-voice-provider-submit="tts"]'));
    await vi.waitFor(() =>
      expect(fieldText('[data-voice-template-url]')).toContain('Use an HTTP(S) URL'),
    );
    expect(addVoiceProvider).not.toHaveBeenCalled();
    type('[data-voice-template-url]', 'https://tts.example/v1/speak');
    await click(document.querySelector('[data-voice-provider-submit="tts"]'));
    await vi.waitFor(() => expect(addVoiceProvider).toHaveBeenCalledTimes(1));
    const input = (addVoiceProvider.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(input).toMatchObject({
      preset: 'custom',
      key: 'secret-key-123',
      template: {
        version: 1,
        url: 'https://tts.example/v1/speak',
        auth: { kind: 'bearer' },
        result: { kind: 'audio' },
      },
    });
    expect(JSON.stringify(input['template'])).not.toContain('secret-key-123');
    expect(validateVoiceTemplate).toHaveBeenLastCalledWith('tts', input['template']);
    await vi.waitFor(() => expect(testVoiceProvider).toHaveBeenCalledWith('p1'));
  });

  it('keeps JSON mistakes in the form and offers an ASR text path', async () => {
    const validateVoiceTemplate = vi.fn();
    await render(
      createElement(VoiceProviderSettings, {
        actions: {
          voiceProviders: vi.fn(async () => VIEW),
          addVoiceProvider: vi.fn(),
          validateVoiceTemplate,
          voiceProviderTemplate: vi.fn(),
          setVoiceProviderTemplate: vi.fn(),
        } as never,
        t: zhTranslate,
      }),
    );
    await openCustom('asr');
    await click(pickerOption('\u0000template'));
    expect(document.querySelector('[data-voice-template-result]')).toBeNull();
    expect(
      (document.querySelector('[data-voice-template-result-path]') as HTMLInputElement).value,
    ).toBe('text');
    type('[data-voice-template-url]', 'https://asr.example/v1/listen');
    type('[data-voice-template-body]', '{"file": ');
    await click(document.querySelector('[data-voice-provider-submit="asr"]'));
    await vi.waitFor(() =>
      expect(fieldText('[data-voice-template-body]')).toContain('不是有效的 JSON。'),
    );
    expect(validateVoiceTemplate).not.toHaveBeenCalled();
  });

  it('does not offer custom requests to a team member', async () => {
    team.member = true;
    await render(
      createElement(VoiceProviderSettings, {
        actions: {
          voiceProviders: vi.fn(async () => VIEW),
          addVoiceProvider: vi.fn(),
          validateVoiceTemplate: vi.fn(),
          voiceProviderTemplate: vi.fn(),
          setVoiceProviderTemplate: vi.fn(),
        } as never,
        t: zhTranslate,
      }),
    );
    await openCustom('tts');
    expect(pickerOption('openai')).not.toBeUndefined();
    expect(pickerOption('\u0000template')).toBeUndefined();
  });
});

describe('template presence in provider lists', () => {
  it('offers editing from the presence flag and reads contents through the Owner-only method', async () => {
    const readTemplate = vi.fn(async () => TEMPLATE);
    await render(
      createElement(VoiceProviderSettings, {
        actions: {
          addVoiceProvider: vi.fn(),
          voiceProviders: vi.fn(async () => ({
            ...VIEW,
            providers: [
              {
                id: 'p1',
                kind: 'tts',
                name: 'Speaker',
                preset: 'custom',
                wire: 'openai',
                baseUrl: 'https://tts.example',
                keySet: true,
                createdAt: '2026-11-24',
                hasTemplate: true,
              },
            ],
          })),
          validateVoiceTemplate: vi.fn(),
          voiceProviderTemplate: readTemplate,
          setVoiceProviderTemplate: vi.fn(),
        } as never,
        t: zhTranslate,
      }),
    );
    await vi.waitFor(() =>
      expect(document.querySelector('[data-voice-provider="p1"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-voice-provider="p1"]')?.textContent).toContain(
      zhTranslate('voice.template.service'),
    );
    await click(document.querySelector('[data-voice-provider="p1"] [aria-expanded]'));
    await click(document.querySelector('[data-voice-template-edit-open="p1"]'));
    await vi.waitFor(() => expect(readTemplate).toHaveBeenCalledWith('p1'));
    expect(document.querySelector('[data-voice-template-url]')).not.toBeNull();
  });
});

describe('editing a custom request', () => {
  it('ignores edits while a save is pending', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const setVoiceProviderTemplate = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    await render(
      createElement(TemplateEditDialog, {
        provider: { id: 'p1', name: 'Speaker' },
        kind: 'tts',
        actions: {
          validateVoiceTemplate: vi.fn(async (_kind: string, template: unknown) => ({
            valid: true,
            template,
          })),
          voiceProviderTemplate: vi.fn(async () => TEMPLATE),
          setVoiceProviderTemplate,
        } as never,
        t: zhTranslate,
        onCancel: vi.fn(),
        onSaved: vi.fn(),
      }),
    );
    await vi.waitFor(() =>
      expect(document.querySelector('[data-voice-template-url]')).not.toBeNull(),
    );
    const url = () =>
      (document.querySelector('[data-voice-template-url]') as HTMLInputElement).value;
    const before = url();
    await click(document.querySelector('[data-voice-template-save="p1"]'));
    await vi.waitFor(() => expect(setVoiceProviderTemplate).toHaveBeenCalled());
    type('[data-voice-template-url]', 'https://tts.example/late');
    expect(url()).toBe(before);
    await act(async () => finish({}));
  });

  it('keeps unsaved edits when the parent passes a new actions object', async () => {
    const voiceProviderTemplate = vi.fn(async () => TEMPLATE);
    const dialog = (actions: object) =>
      createElement(TemplateEditDialog, {
        provider: { id: 'p1', name: 'Speaker' },
        kind: 'tts',
        actions: actions as never,
        t: zhTranslate,
        onCancel: vi.fn(),
        onSaved: vi.fn(),
      });
    const methods = {
      validateVoiceTemplate: vi.fn(),
      voiceProviderTemplate,
      setVoiceProviderTemplate: vi.fn(),
    };
    await render(dialog({ ...methods }));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-voice-template-url]')).not.toBeNull(),
    );
    type('[data-voice-template-url]', 'https://tts.example/edited');
    await act(async () => root!.render(dialog({ ...methods })));
    expect(voiceProviderTemplate).toHaveBeenCalledTimes(1);
    expect((document.querySelector('[data-voice-template-url]') as HTMLInputElement).value).toBe(
      'https://tts.example/edited',
    );
  });

  it('loads the stored template, shows header auth fields and saves through the template setter', async () => {
    const setVoiceProviderTemplate = vi.fn(async () => ({}));
    const onSaved = vi.fn();
    await render(
      createElement(TemplateEditDialog, {
        provider: { id: 'p1', name: 'Speaker' },
        kind: 'tts',
        actions: {
          validateVoiceTemplate: vi.fn(async (_kind: string, template: unknown) => ({
            valid: true,
            template,
          })),
          voiceProviderTemplate: vi.fn(async () => TEMPLATE),
          setVoiceProviderTemplate,
        } as never,
        t: zhTranslate,
        onCancel: vi.fn(),
        onSaved,
      }),
    );
    await vi.waitFor(() =>
      expect(
        (document.querySelector('[data-voice-template-auth-name]') as HTMLInputElement).value,
      ).toBe('X-API-Key'),
    );
    expect(
      (document.querySelector('[data-voice-template-auth-prefix]') as HTMLInputElement).value,
    ).toBe('Token ');
    expect(
      (document.querySelector('[data-voice-template-result-path]') as HTMLInputElement).value,
    ).toBe('data.audio');
    type('[data-voice-template-url]', 'https://tts.example/v2/speak');
    await click(document.querySelector('[data-voice-template-save="p1"]'));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(setVoiceProviderTemplate).toHaveBeenCalledWith('p1', {
      ...TEMPLATE,
      url: 'https://tts.example/v2/speak',
    });
  });
});
