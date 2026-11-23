import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { modelScopeKey } from '@botharness/host-client/model-settings';

import type { ModelsView } from '../src/ui/chat/model-settings-screen';
import type { SubChoicePicker } from '../src/ui/chat/sub-choice-picker';
import BotModelPickerScreen from '../app/bot/[slug]/model-picker';
import GlobalModelPickerScreen from '../app/settings/model-picker';

const { params } = vi.hoisted(() => ({ params: vi.fn() }));
vi.mock('expo-router', () => ({ useLocalSearchParams: params }));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ client: {}, saved: { hostId: 'test-host' } }),
}));
vi.mock('../src/ui/chat/sheet', () => ({ SheetNote: () => null }));
vi.mock('../src/ui/chat/model-settings-screen', () => ({
  ModelsView: ({ picker, scope }: Parameters<typeof ModelsView>[0]) => (
    <h1>{picker ?? `${modelScopeKey(scope)} editor`}</h1>
  ),
}));
vi.mock('../src/ui/chat/sub-choice-picker', () => ({
  SubChoicePicker: ({ field }: Parameters<typeof SubChoicePicker>[0]) => <h1>{field}</h1>,
}));

describe('mobile model picker routes', () => {
  it.each(['assignment', 'allowed', 'allowed-effort', 'assignment-effort'])(
    'opens the editor from a legacy %s link',
    (field) => {
      params.mockReturnValue({ field, id: 'fast', slug: 'qa', group: 'daily' });
      expect(renderToStaticMarkup(<BotModelPickerScreen />)).toBe('<h1>bot:qa editor</h1>');
      expect(renderToStaticMarkup(<GlobalModelPickerScreen />)).toBe('<h1>preset:fast editor</h1>');
    },
  );

  it.each(['orchestrator', 'orchestrator-effort', 'sub-add', 'sub-effort'])(
    'still opens the %s picker',
    (field) => {
      params.mockReturnValue({ field, slug: 'qa' });
      expect(renderToStaticMarkup(<BotModelPickerScreen />)).toBe(`<h1>${field}</h1>`);
    },
  );
});
