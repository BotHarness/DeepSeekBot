import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { enTranslate } from '../src/client/locale.js';
import { SessionTargetChip } from '../src/client/session-target-chip.js';

it('uses a single provider badge and the model name in a Sessions row', () => {
  const result = renderToStaticMarkup(
    <SessionTargetChip
      target={{ kind: 'engine', engine: 'codex', account: 'ChatGPT pro', model: 'gpt-6.2-sol' }}
      route={{ provider: 'opencode-go', model: 'deepseek-v4.1-flash' }}
      t={enTranslate}
    />,
  );
  expect(result).toContain('data-model-brand="openai"');
  expect(result.match(/data-external-engine-badge/g)).toHaveLength(1);
  expect(result).toContain('aria-label="External engine"');
  expect(result).toContain('>GPT-6.2-Sol<');
});

it('shows engine and account in the header and labels a native fallback as a native model', () => {
  const engine = renderToStaticMarkup(
    <SessionTargetChip
      target={{ kind: 'engine', engine: 'claude', account: 'Claude Max', model: 'claude-opus-5-5' }}
      header
      t={enTranslate}
    />,
  );
  expect(engine).toContain('>Claude Code · Max<');
  const fallback = renderToStaticMarkup(
    <SessionTargetChip
      target={{ kind: 'dsh', provider: 'opencode-go', model: 'deepseek-v4.1-flash' }}
      engine={{ engine: 'codex', account: 'ChatGPT Pro' }}
      header
      t={enTranslate}
    />,
  );
  expect(fallback).toContain('data-model-brand="deepseek"');
  expect(fallback).not.toContain('data-external-engine-badge');
});
