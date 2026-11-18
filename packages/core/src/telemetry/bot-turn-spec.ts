import { CONTEXT_SOURCES, type ContextSource } from '../runtime/context-source-names.js';

export const BOT_TURN_ROLES = ['orchestrator', 'assignment', 'other'] as const;
export const BOT_TURN_OUTCOMES = ['completed', 'failed', 'cancelled', 'other'] as const;
export const BOT_TURN_TRIGGERS = ['human', 'inbox', 'mixed', 'other'] as const;

export function contextSourceProperty(source: ContextSource, scope: 'context' | 'added'): string {
  return `${scope}_${source.replaceAll('-', '_')}_token_count`;
}

export const BOT_TURN_CONTEXT_PROPERTIES: readonly string[] = CONTEXT_SOURCES.flatMap((source) => [
  contextSourceProperty(source, 'context'),
  contextSourceProperty(source, 'added'),
]);
