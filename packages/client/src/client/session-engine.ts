import type { SessionEngine } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

export function engineName(engine: string): string {
  if (engine === 'codex') return 'Codex';
  if (engine === 'claude') return 'Claude Code';
  return engine;
}

export function sessionEngineText(engine: SessionEngine, t: BotHarnessTranslate): string {
  if (engine.state === 'starting')
    return t('sessions.detail.engineStarting', { engine: engineName(engine.engine) });
  if (engine.account === undefined) return engineName(engine.engine);
  return t('sessions.detail.engine', {
    engine: engineName(engine.engine),
    account: engine.account,
  });
}
