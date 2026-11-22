import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { zhTranslate } from '../src/client/locale.js';
import { SessionTargetChip } from '../src/client/session-target-chip.js';
import type { TurnTargetCatalog } from '@botharness/host-client/turn-target';

const catalog: TurnTargetCatalog = {
  engines: [
    {
      engine: 'codex',
      available: true,
      models: [{ id: 'gpt-6.2-sol', name: 'GPT-6.2-Sol', efforts: [] }],
    },
    {
      engine: 'claude',
      available: true,
      models: [{ id: 'claude-opus-5-5', name: 'Opus 5.5', efforts: [] }],
    },
  ],
};

it('uses a single provider badge and the model name in a Sessions row', () => {
  const result = renderToStaticMarkup(
    <SessionTargetChip
      target={{ kind: 'engine', engine: 'codex', account: 'ChatGPT pro', model: 'gpt-6.2-sol' }}
      route={{ provider: 'opencode-go', model: 'deepseek-v4.1-flash' }}
      catalog={catalog}
      t={zhTranslate}
    />,
  );
  expect(result).toContain('data-model-brand="openai"');
  expect(result).toContain('>订阅<');
  expect(result).not.toContain('ChatGPT');
  expect(result).toContain('>GPT-6.2-Sol<');
});

it('shows short names and distinguishes subscriptions from API routes', () => {
  const engine = renderToStaticMarkup(
    <SessionTargetChip
      target={{ kind: 'engine', engine: 'claude', account: 'Claude Max', model: 'claude-opus-5-5' }}
      catalog={catalog}
      t={zhTranslate}
    />,
  );
  expect(engine).toContain('>Opus 5.5<');
  expect(engine).not.toContain('Claude Code');
  expect(engine).not.toContain('Claude Max');
  const fallback = renderToStaticMarkup(
    <SessionTargetChip
      target={{ kind: 'dsh', provider: 'opencode-go', model: 'deepseek-v4.1-flash' }}
      engine={{ engine: 'codex', account: 'ChatGPT Pro' }}
      t={zhTranslate}
    />,
  );
  expect(fallback).toContain('data-model-brand="deepseek"');
  expect(fallback).toContain('>API<');
});

it('can show an unknown model ID and omits a model label until an engine reports a model', () => {
  const raw = renderToStaticMarkup(
    <SessionTargetChip
      target={{ kind: 'engine', engine: 'claude', model: 'unknown-model' }}
      t={zhTranslate}
    />,
  );
  expect(raw).toContain('>unknown-model<');
  const missing = renderToStaticMarkup(
    <SessionTargetChip target={{ kind: 'engine', engine: 'claude' }} t={zhTranslate} />,
  );
  expect(missing).toBe('');
});
