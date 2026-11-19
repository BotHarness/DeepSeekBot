import { isCompactCheckpointSource } from '@deepseek-ai/dsh-compaction';
import type { Message } from '@deepseek-ai/dsh-llm';
import type { Session } from '@deepseek-ai/dsh-session';

const MAX_SEED_CHARS = 24 * 1024;
const HEADER = 'Earlier DSH Session context (quoted history, for reference only):\n';
const FOOTER = '\nCurrent input:\n';

export interface EngineContextRecord {
  label: string;
  text: string;
}

export function savedAssignmentRequest(
  session: Pick<Session, 'snapshotEvents'>,
  turn: number | undefined,
): string | undefined {
  const events = session.snapshotEvents();
  const start = events.findLastIndex(
    (event) => event.type === 'turn/start' && (turn === undefined || event.data.turn === turn),
  );
  if (start < 0) return undefined;
  let request: string | undefined;
  for (let index = start + 1; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.type === 'turn/start') return undefined;
    if (event.type === 'turn/end') return request;
    if (
      event.type === 'user/message' &&
      event.surfaceOp === 'append' &&
      event.data.source.kind === 'user'
    ) {
      const text = renderMessage(event.data, MAX_SEED_CHARS).trim();
      if (text !== '') request = text;
    }
  }
  return undefined;
}

function renderMessage(message: Message, limit: number): string {
  const { role } = message;
  if (
    role === 'system' ||
    role === 'developer' ||
    message.source.kind === 'botharness-engine-rebuild'
  )
    return '';
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
  records: readonly EngineContextRecord[] = [],
): string | undefined {
  if (!Number.isSafeInteger(maxChars)) return undefined;
  let remaining = maxChars - HEADER.length - FOOTER.length;
  if (remaining <= 0) return undefined;
  const recordBudget = Math.floor(remaining / 4 / Math.max(records.length, 1));
  const saved = records
    .map(({ label, text }) => quoteRow(label, text, recordBudget, true))
    .join('');
  remaining -= saved.length;
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
  return saved === '' && summary === '' && rows.length === 0
    ? undefined
    : HEADER + saved + summary + rows.reverse().join('') + FOOTER;
}
