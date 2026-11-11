import { bubbleTime, type ChatRow } from './message-groups';
import { BUBBLE_PADDING, AVATAR_CORNER } from './bubble-shape';
import { radius, space } from '../design/tokens';

export const nativeTextRows = process.env.EXPO_PUBLIC_NATIVE_ROWS === 'text';

export type NativeTextRow = {
  key: string;
  human: boolean;
  first: boolean;
  last: boolean;
  body: string;
  time: string;
};

export type NativeTextStyle = {
  accent: string;
  surface: string;
  onAccent: string;
  fg: string;
  muted: string;
  bodySize: number;
  bodyLine: number;
  metaSize: number;
  metaLine: number;
  fontScale: number;
  rowInset: number;
  firstGap: number;
  joinGap: number;
  lastGap: number;
  padX: number;
  padY: number;
  timeGap: number;
  stackGap: number;
  open: number;
  join: number;
  tail: number;
  besideMax: number;
  maxWidth: number;
};

const MARKDOWN = /[*_`#>|[\]~<\\]|^\s*([-+]|\d+[.)])\s|https?:\/\/|www\./m;
const DELIVERED = ' ✓';

export function plainText(body: string): boolean {
  return body.trim() !== '' && !MARKDOWN.test(body);
}

export type NativeRowContext = {
  dm: boolean;
  selecting: boolean;
  latest: string | undefined;
  reading: ReadonlyMap<string, unknown>;
};

export function nativeTextRow(row: ChatRow, context: NativeRowContext): NativeTextRow | undefined {
  if (row.kind !== 'message' || !context.dm || context.selecting) return undefined;
  const message = row.message;
  if (message.id === context.latest || context.reading.has(message.id)) return undefined;
  if (message.author === 'system' || message.delivery !== 'committed') return undefined;
  if (
    message.activity !== undefined ||
    message.sessionFailure !== undefined ||
    message.card !== undefined ||
    message.genuiDocument !== undefined ||
    message.voice !== undefined ||
    message.attachments.length > 0 ||
    message.replyTo !== undefined ||
    message.replyPreview != null ||
    (message.reactions?.length ?? 0) > 0 ||
    (message.mentions?.length ?? 0) > 0 ||
    message.welcome === true
  )
    return undefined;
  if (!plainText(message.body)) return undefined;
  const clock = bubbleTime(message.at);
  if (clock === '') return undefined;
  const human = message.author === 'human';
  return {
    key: row.key,
    human,
    first: row.first,
    last: row.last,
    body: message.body,
    time: human ? `${clock}${DELIVERED}` : clock,
  };
}

export function nativeTextStyle(
  color: { accent: string; surface: string; onAccent: string; fg: string; muted: string },
  type: { body: { size: number; line: number }; meta: { size: number; line: number } },
  fontScale: number,
): NativeTextStyle {
  return {
    ...color,
    bodySize: type.body.size,
    bodyLine: type.body.line,
    metaSize: type.meta.size,
    metaLine: type.meta.line,
    fontScale,
    rowInset: space.x4,
    firstGap: space.x4,
    joinGap: space.x1,
    lastGap: space.x2,
    padX: BUBBLE_PADDING.horizontal,
    padY: BUBBLE_PADDING.vertical,
    timeGap: space.x3,
    stackGap: space.x2,
    open: radius.lg,
    join: radius.sm,
    tail: AVATAR_CORNER,
    besideMax: 60,
    maxWidth: 0.88,
  };
}
