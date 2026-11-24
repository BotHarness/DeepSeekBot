// @vitest-environment jsdom
import { act, createElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, SvgXml: () => null }));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  ChevronRightIcon: () => null,
}));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../src/ui/voice/voice-catalog-list', () => ({ VoiceCatalogList: () => null }));
vi.mock('../src/ui/primitives/drawer-header', () => ({
  DrawerHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <>
      <h2>{title}</h2>
      {subtitle === undefined ? null : <p>{subtitle}</p>}
    </>
  ),
}));
vi.mock('../src/ui/chat/model-brand-icon', () => ({ ModelBrandIcon: () => null }));
vi.mock('../src/ui/chat/sheet', () => ({
  SHEET_GROUP: 'sheet',
  Sheet: ({
    visible,
    label,
    children,
  }: {
    visible: boolean;
    label: string;
    children: ReactNode;
  }) => (visible ? createElement('div', { role: 'dialog', 'aria-label': label }, children) : null),
  SheetActions: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  SheetCallout: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));

import type { VoiceServicesView } from '@botharness/host-client/voice-providers';
import { voiceTemplateOf } from '@botharness/host-client/voice-templates';
import type { VoiceRequestTemplate } from '@botharness/host-protocol/voice-request-template';
import { t } from '../src/ui/strings';
import { VoiceServiceSheet, type VoiceServiceSheetPort } from '../src/ui/voice/voice-service-sheet';
import { VoiceTemplateSheet, type VoiceTemplatePort } from '../src/ui/voice/voice-template-sheet';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  return host;
}

const byTest = (view: HTMLElement, id: string) =>
  view.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function press(view: HTMLElement, id: string) {
  const node = byTest(view, id);
  await act(async () => (node?.closest<HTMLElement>('button') ?? node)!.click());
  await act(async () => undefined);
}

async function type(view: HTMLElement, id: string, value: string) {
  const field = byTest(view, id) as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const copy = t.voiceSettings;

const VIEW: VoiceServicesView = {
  presets: [
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyRequired: true },
  ],
  providers: [],
  asrPresets: [],
  asrProviders: [],
  defaults: { tts: null, asr: null },
};

const TEMPLATE: VoiceRequestTemplate = {
  version: 1,
  url: 'https://tts.example/v1/speak',
  method: 'POST',
  auth: { kind: 'header', name: 'X-API-Key', prefix: '' },
  headers: {},
  body: { kind: 'json', value: { text: '{text}' } },
  result: { kind: 'audio' },
};

const ADDED: VoiceRequestTemplate = {
  version: 1,
  url: 'https://tts.example/v1/speak',
  method: 'POST',
  auth: { kind: 'bearer' },
  headers: {},
  body: { kind: 'json', value: { text: '{text}', voice: '{voice}' } },
  result: { kind: 'audio' },
};

const EDITED: VoiceRequestTemplate = {
  version: 1,
  url: 'https://tts.example/v2/speak',
  method: 'POST',
  auth: { kind: 'header', name: 'X-API-Key', prefix: '' },
  headers: {},
  body: { kind: 'json', value: { text: '{text}' } },
  result: { kind: 'audio' },
};

const SERVICE = {
  id: 'tts-9',
  name: 'Speak',
  preset: 'custom',
  baseUrl: 'https://tts.example',
  keySet: true,
  hasTemplate: true,
};

function sheetPort(): VoiceServiceSheetPort {
  return {
    add: vi.fn(async () => SERVICE),
    browse: vi.fn(),
    importVoice: vi.fn(),
    validate: vi.fn(async (kind, template) => ({
      valid: true as const,
      template: voiceTemplateOf(template, 'voiceTemplateValidate', kind),
    })),
  };
}

it('adds a custom request service through validation', async () => {
  const port = sheetPort();
  const added = vi.fn();
  const view = await render(
    <VoiceServiceSheet kind="tts" view={VIEW} port={port} onClose={vi.fn()} onAdded={added} />,
  );
  await press(view, 'voice-service-preset');
  await press(view, 'voice-service-preset-custom');
  expect(view.textContent).toContain(copy.template.service);
  expect(byTest(view, 'voice-template-url')).not.toBeNull();
  expect(byTest(view, 'voice-template-body')).not.toBeNull();
  expect(byTest(view, 'voice-template-result-path')).toBeNull();
  const submit = byTest(view, 'voice-service-submit')!.closest('button')!;
  expect(submit.disabled).toBe(true);
  await type(view, 'voice-template-url', 'https://tts.example/v1/speak');
  await type(view, 'voice-service-key', 'dummy-key');
  await press(view, 'voice-service-submit');
  expect(vi.mocked(port.validate).mock.calls).toEqual([['tts', ADDED]]);
  expect(vi.mocked(port.add).mock.calls).toEqual([
    [
      {
        kind: 'tts',
        preset: 'custom',
        name: copy.template.service,
        key: 'dummy-key',
        template: ADDED,
      },
    ],
  ]);
  expect(added).toHaveBeenCalledWith(SERVICE);
});

it('addresses method and body choices by stable testIDs', async () => {
  const port = sheetPort();
  const view = await render(
    <VoiceServiceSheet kind="tts" view={VIEW} port={port} onClose={vi.fn()} onAdded={vi.fn()} />,
  );
  await press(view, 'voice-service-preset');
  await press(view, 'voice-service-preset-custom');
  for (const id of ['post', 'get'])
    expect(byTest(view, `voice-template-method-${id}`)?.getAttribute('aria-label')).toBe(
      id.toUpperCase(),
    );
  for (const id of ['json', 'ssml', 'multipart', 'none'])
    expect(byTest(view, `voice-template-body-${id}`)).not.toBeNull();
  await press(view, 'voice-template-body-none');
  expect(byTest(view, 'voice-template-body')).toBeNull();
  await press(view, 'voice-template-body-json');
  expect(byTest(view, 'voice-template-body')).not.toBeNull();
  await press(view, 'voice-template-method-get');
  expect(byTest(view, 'voice-template-body-json')).toBeNull();
  expect(byTest(view, 'voice-template-body')).toBeNull();
});

it('starts from an example and keeps local JSON errors on the field', async () => {
  const port = sheetPort();
  const view = await render(
    <VoiceServiceSheet kind="asr" view={VIEW} port={port} onClose={vi.fn()} onAdded={vi.fn()} />,
  );
  await press(view, 'voice-service-preset');
  await press(view, 'voice-service-preset-custom');
  await press(view, 'voice-template-example');
  await press(view, 'voice-template-example-whisper');
  const url = byTest(view, 'voice-template-url') as HTMLTextAreaElement;
  expect(url.value).toBe('https://api.openai.com/v1/audio/transcriptions');
  expect((byTest(view, 'voice-service-model-custom') as HTMLTextAreaElement).value).toBe(
    'whisper-1',
  );
  expect((byTest(view, 'voice-template-result-path') as HTMLTextAreaElement).value).toBe('text');
  await type(view, 'voice-template-headers', '{');
  await press(view, 'voice-service-submit');
  expect(view.textContent).toContain(copy.template.invalidJson);
  expect(port.validate).not.toHaveBeenCalled();
  expect(port.add).not.toHaveBeenCalled();
});

it('shows Host refusals next to their field', async () => {
  const port = sheetPort();
  port.validate = vi.fn(async () => ({
    valid: false as const,
    errors: [{ path: 'url', message: 'Use an https URL.' }],
  }));
  const view = await render(
    <VoiceServiceSheet kind="tts" view={VIEW} port={port} onClose={vi.fn()} onAdded={vi.fn()} />,
  );
  await press(view, 'voice-service-preset');
  await press(view, 'voice-service-preset-custom');
  await type(view, 'voice-template-url', 'http://tts.example');
  await press(view, 'voice-service-submit');
  expect(view.textContent).toContain('Use an https URL.');
  expect(port.add).not.toHaveBeenCalled();
});

it('edits an existing request and saves it', async () => {
  const port: VoiceTemplatePort = {
    template: vi.fn(async () => TEMPLATE),
    validate: vi.fn(async (kind, template) => ({
      valid: true as const,
      template: voiceTemplateOf(template, 'voiceTemplateValidate', kind),
    })),
    saveTemplate: vi.fn(async () => SERVICE),
  };
  const saved = vi.fn();
  const view = await render(
    <VoiceTemplateSheet
      kind="tts"
      service={SERVICE}
      port={port}
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  expect(port.template).toHaveBeenCalledWith('tts-9');
  expect(view.textContent).toContain(copy.template.editTitle('Speak'));
  expect((byTest(view, 'voice-template-auth-name') as HTMLTextAreaElement).value).toBe('X-API-Key');
  await type(view, 'voice-template-url', 'https://tts.example/v2/speak');
  await press(view, 'voice-template-save');
  expect(vi.mocked(port.validate).mock.calls).toEqual([['tts', EDITED]]);
  expect(vi.mocked(port.saveTemplate).mock.calls).toEqual([['tts-9', EDITED]]);
  expect(saved).toHaveBeenCalledWith(SERVICE);
});

it('keeps the Android edit heading separate from the provider name', async () => {
  const { Platform } = await import('./react-native-shim');
  const original = Platform.OS;
  Platform.OS = 'android';
  try {
    const name = 'A custom speech service with a long name';
    const view = await render(
      <VoiceTemplateSheet
        kind="tts"
        service={{ ...SERVICE, name }}
        port={{
          template: async () => TEMPLATE,
          validate: vi.fn(),
          saveTemplate: vi.fn(),
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(view.querySelector('h2')?.textContent).toBe(copy.template.edit);
    expect(view.querySelector('h2 + p')?.textContent).toBe(name);
  } finally {
    Platform.OS = original;
  }
});

it('says only the Owner can read a template', async () => {
  const { MethodRefused } = await import('@botharness/host-client/client-errors');
  const port: VoiceTemplatePort = {
    template: vi.fn(async () => {
      throw new MethodRefused('remote-access/denied', 'denied');
    }),
    validate: vi.fn(),
    saveTemplate: vi.fn(),
  };
  const view = await render(
    <VoiceTemplateSheet
      kind="tts"
      service={SERVICE}
      port={port}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  expect(view.textContent).toContain(copy.ownerOnly);
  expect(byTest(view, 'voice-template-save')!.closest('button')!.disabled).toBe(true);
});
