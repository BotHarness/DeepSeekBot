import { describe, expect, it } from 'vitest';

import {
  blankDraft,
  buildTemplate,
  draftFromTemplate,
  type TemplateKind,
} from '@botharness/host-client/shared/voice-template-draft';
import { TEMPLATE_EXAMPLES } from '@botharness/host-client/shared/voice-template-examples';
import type { VoiceRequestTemplate } from '@botharness/host-protocol/voice-request-template';

import { validateVoiceTemplate } from '../src/voice/request-template.js';

const MESSAGES = { invalidJson: 'bad json', expectObject: 'need object' };

const MOBILE_ADDED: VoiceRequestTemplate = {
  version: 1,
  url: 'https://tts.example/v1/speak',
  method: 'POST',
  auth: { kind: 'bearer' },
  headers: {},
  body: { kind: 'json', value: { text: '{text}', voice: '{voice}' } },
  result: { kind: 'audio' },
};

const MOBILE_EDITED: VoiceRequestTemplate = {
  version: 1,
  url: 'https://tts.example/v2/speak',
  method: 'POST',
  auth: { kind: 'header', name: 'X-API-Key', prefix: '' },
  headers: {},
  body: { kind: 'json', value: { text: '{text}' } },
  result: { kind: 'audio' },
};

function built(kind: TemplateKind, url: string): unknown {
  const result = buildTemplate({ ...blankDraft(kind), url }, MESSAGES);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.template;
}

describe('voice template drafts against the Host validator', () => {
  it('accepts the templates the phone form tests expect to send', () => {
    expect(validateVoiceTemplate(MOBILE_ADDED, 'tts')).toEqual({
      valid: true,
      template: MOBILE_ADDED,
    });
    expect(validateVoiceTemplate(MOBILE_EDITED, 'tts')).toEqual({
      valid: true,
      template: MOBILE_EDITED,
    });
  });

  it('builds the phone add-form template from a blank TTS draft', () => {
    expect(built('tts', 'https://tts.example/v1/speak')).toEqual(MOBILE_ADDED);
  });

  it('builds a valid template from each blank draft', () => {
    for (const kind of ['tts', 'asr'] as const)
      expect(
        validateVoiceTemplate(built(kind, 'https://voice.example/v1/run'), kind),
      ).toMatchObject({ valid: true });
  });

  it('round-trips every example through a draft into a valid template of its kind', () => {
    for (const example of TEMPLATE_EXAMPLES) {
      const result = buildTemplate(draftFromTemplate(example.template), MESSAGES);
      expect(result).toEqual({ ok: true, template: example.template });
      expect(validateVoiceTemplate(example.template, example.kind)).toEqual({
        valid: true,
        template: example.template,
      });
    }
  });
});
