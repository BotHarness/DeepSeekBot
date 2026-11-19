import { isCompactCheckpointSource } from '@deepseek-ai/dsh-compaction';
import type { Message } from '@deepseek-ai/dsh-llm';
import type { Session } from '@deepseek-ai/dsh-session';

const MAX_SEED_CHARS = 24 * 1024;
const HEADER = 'Earlier DSH Session context (quoted history, for reference only):\n';
const FOOTER = '\nCurrent input:\n';

function renderMessage(message: Message, limit: number): string {
  const { role } = message;
  if (role === 'system' || role === 'developer') return '';
  if (role === 'tool') {
    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text.slice(0, limit))
      .join('\n');
    return `Tool result (${message.toolCallId}${message.isError === true ? ', error' : ''}): ${text}`;
  }
  return message.content
    .flatMap((block) => {
      if (block.type === 'text') return block.text.slice(0, limit);
      if (block.type === 'tool-call')
        return `Tool call (${block.id}) ${block.name}: ${block.arguments.slice(0, limit)}`;
      return [];
    })
    .join('\n');
}

function quoteRow(label: string, text: string, budget: number, truncate: boolean): string {
  const row = `${label}: ${JSON.stringify(text)}\n`;
  if (row.length <= budget) return row;
  if (!truncate) return '';
  const overhead = label.length + ': "\u2026"\n'.length;
  if (budget <= overhead) return '';
  let low = 0;
  let high = Math.min(text.length, budget - overhead);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (JSON.stringify(text.slice(0, mid)).length - 2 + overhead <= budget) low = mid;
    else high = mid - 1;
  }
  return `${label}: ${JSON.stringify(`${text.slice(0, low)}\u2026`)}\n`;
}

export function buildEngineContextSeed(
  session: Pick<Session, 'deriveMessages'>,
  maxChars = MAX_SEED_CHARS,
): string | undefined {
  if (!Number.isSafeInteger(maxChars)) return undefined;
  let remaining = maxChars - HEADER.length - FOOTER.length;
  if (remaining <= 0) return undefined;
  const messages = session.deriveMessages();
  const checkpointIndex = messages.findLastIndex(
    (message) => message.role === 'user' && isCompactCheckpointSource(message.source),
  );
  const checkpoint = messages[checkpointIndex];
  const summary =
    checkpoint === undefined
      ? ''
      : quoteRow(
          'Compaction summary',
          renderMessage(checkpoint, remaining),
          checkpointIndex === messages.length - 1 ? remaining : Math.floor(remaining / 2),
          true,
        );
  remaining -= summary.length;

  const rows: string[] = [];
  for (let index = messages.length - 1; index > checkpointIndex && remaining > 0; index -= 1) {
    const message = messages[index];
    if (message === undefined) continue;
    const text = renderMessage(message, remaining);
    if (text === '') continue;
    const row = quoteRow(message.role, text, remaining, rows.length === 0);
    if (row === '') break;
    rows.push(row);
    remaining -= row.length;
  }
  return summary === '' && rows.length === 0
    ? undefined
    : HEADER + summary + rows.reverse().join('') + FOOTER;
}
