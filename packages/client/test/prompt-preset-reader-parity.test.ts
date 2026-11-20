import { expect, it } from 'vitest';

import { HostAnswerInvalid } from '@botharness/host-client/bot-settings';
import {
  loadPromptLibrary,
  promptPresetChanges,
  promptPresetStale,
  setGlobalPromptPreset,
} from '@botharness/host-client/prompt-presets';
import { createActions } from '../src/client/actions.js';
import { createStore } from '../src/client/store.js';

const answers: Record<string, unknown> = {
  promptParts: {
    parts: [
      {
        id: 'coordination',
        kind: 'system',
        section: 'Team',
        defaultText: 'Lead.',
        defaultHash: 'h2',
      },
      { id: 'silence', kind: 'turn', section: 'Turn', defaultText: 'Quiet.', defaultHash: 'h1' },
      { id: 'broken', kind: 'other', defaultText: 'x', defaultHash: 'x' },
    ],
    limits: [
      { id: 'review-tool-calls', group: 'review', defaultValue: 12, min: 1, max: 100 },
      { id: 'broken', group: 'review', defaultValue: '12', min: 1, max: 100 },
    ],
  },
  promptPresets: {
    presets: [
      {
        id: 'concise',
        name: 'Concise',
        revision: 3,
        parts: { coordination: { text: 'Be brief.', base: 'h1' }, silence: { text: 1 } },
        limits: { 'review-tool-calls': 6, 'dm-context-chars': 'many' },
        updatedAt: '2026-11-17T00:00:00.000Z',
      },
      { id: 'unnamed', revision: 1 },
    ],
    globalPresetId: 'concise',
  },
};

function hostCall(method: string, args: Record<string, unknown> = {}) {
  if (method === 'promptGlobalSet') return { presetId: args['presetId'] };
  return answers[method];
}

it('reads the same Prompt Presets on desktop and on a phone or remote Host', async () => {
  const actions = createActions(
    async (endpoint, payload) => ({ ok: true, value: hostCall(endpoint, payload) }),
    createStore(),
  );
  const phone = await loadPromptLibrary({
    call: async (method, args) => hostCall(method, args) as never,
  });
  const desktop = { ...(await actions.promptParts!()), ...(await actions.promptPresets!()) };
  expect(desktop).toEqual(phone);
  expect(phone.parts.map((part) => part.id)).toEqual(['coordination', 'silence']);
  expect(phone.limits.map((limit) => limit.id)).toEqual(['review-tool-calls']);
  expect(phone.presets).toEqual([
    {
      id: 'concise',
      name: 'Concise',
      revision: 3,
      parts: { coordination: { text: 'Be brief.', base: 'h1' } },
      limits: { 'review-tool-calls': 6 },
      updatedAt: '2026-11-17T00:00:00.000Z',
    },
  ]);
  const [concise] = phone.presets;
  expect(promptPresetChanges(concise!)).toBe(2);
  expect(promptPresetStale(concise!, phone.parts)).toBe(true);
});

it('rejects answers that are not Prompt Presets on both sides', async () => {
  const actions = createActions(
    async () => ({ ok: true, value: { presets: 'none' } }),
    createStore(),
  );
  await expect(actions.promptPresets!()).rejects.toBeInstanceOf(HostAnswerInvalid);
  await expect(
    setGlobalPromptPreset({ call: async () => ({}) as never }, 'concise'),
  ).rejects.toBeInstanceOf(HostAnswerInvalid);
  await expect(
    setGlobalPromptPreset({ call: async () => ({ presetId: null }) as never }, null),
  ).resolves.toEqual({ presetId: null });
});
