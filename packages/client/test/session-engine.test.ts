import { describe, expect, it } from 'vitest';

import type { BotHarnessTranslate } from '../src/client/locale.js';
import { zhTranslate } from '../src/client/locale.js';
import { sessionEngineText } from '../src/client/session-engine.js';

const t = zhTranslate as unknown as BotHarnessTranslate;

describe('Session engine line', () => {
  it('says the engine is waiting for approval while a card is open', () => {
    expect(sessionEngineText({ engine: 'codex', state: 'waiting-approval' }, t)).toBe(
      'Codex 在等你批准',
    );
    expect(
      sessionEngineText({ engine: 'codex', account: 'ChatGPT pro', state: 'running' }, t),
    ).toBe('运行在 Codex（ChatGPT pro）');
  });
});
