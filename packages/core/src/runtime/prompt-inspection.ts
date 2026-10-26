import type { DshSessionEvent } from '../sessions/source.js';

export interface PromptSectionView {
  name: string;
  text: string;
}

export interface BotSystemPromptView {
  sessionId: string | null;
  loaded: boolean;
  effectiveText: string | null;
  effectiveSource: 'session' | 'log' | 'none';
  next: { text: string; sections: PromptSectionView[]; contexts: PromptSectionView[] } | null;
  pending: boolean;
}

export interface TurnInputMessage {
  step: number;
  source: string;
  at: string;
  text: string;
}

export interface TurnInputView {
  turn: number;
  startedAt?: string;
  messages: TurnInputMessage[];
}

export interface BotTurnInputView {
  slug: string;
  sessionId: string;
  turns: TurnInputView[];
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function messageText(message: unknown): string {
  const content = object(message)['content'];
  if (!Array.isArray(content)) return '';
  return content
    .map(object)
    .map((part) =>
      part['type'] === 'text' && typeof part['text'] === 'string'
        ? part['text']
        : part['type'] === 'image'
          ? '[image]'
          : part['type'] === 'file'
            ? '[file]'
            : '',
    )
    .filter((part) => part !== '')
    .join('\n\n');
}

export function systemPromptFromLog(events: readonly DshSessionEvent[]): string | null {
  const texts = events
    .filter((event) => event.type === 'system/message')
    .map((event) => messageText(object(event.data)['message']))
    .filter((text) => text !== '');
  return texts.length === 0 ? null : texts.join('\n\n');
}

export function summarizeTurnInput(
  events: readonly DshSessionEvent[],
  options: { turns: number },
): { turns: TurnInputView[] } {
  const turns = new Map<number, TurnInputView>();
  const turnOf = (turn: number) => {
    let entry = turns.get(turn);
    if (entry === undefined) {
      entry = { turn, messages: [] };
      turns.set(turn, entry);
    }
    return entry;
  };
  let turn: number | undefined;
  let step = 0;
  for (const event of events) {
    const data = object(event.data);
    if (event.type === 'turn/start' && typeof data['turn'] === 'number') {
      turn = data['turn'];
      step = 0;
      turnOf(turn).startedAt = new Date(event.time).toISOString();
    } else if (event.type === 'step/start' && typeof data['step'] === 'number') {
      step = data['step'];
    } else if (event.type === 'user/message' && turn !== undefined) {
      const source = object(data['source'])['kind'];
      turnOf(turn).messages.push({
        step: Math.max(step, 1),
        source: typeof source === 'string' ? source : 'user',
        at: new Date(event.time).toISOString(),
        text: messageText(data),
      });
    }
  }
  return {
    turns: [...turns.values()]
      .filter((entry) => entry.messages.length > 0)
      .sort((a, b) => a.turn - b.turn)
      .slice(-options.turns),
  };
}
