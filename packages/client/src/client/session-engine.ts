import type { SessionEngine } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

function engineName(engine: string): string {
  return engine === 'codex' ? 'Codex' : engine;
}

export function sessionEngineText(engine: SessionEngine, t: BotHarnessTranslate): string {
  return engine.state === 'starting' || engine.account === undefined
    ? t('sessions.detail.engineStarting', { engine: engineName(engine.engine) })
    : t('sessions.detail.engine', { engine: engineName(engine.engine), account: engine.account });
}
