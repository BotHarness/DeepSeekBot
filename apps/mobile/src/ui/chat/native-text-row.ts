import { bubbleTime, type ChatRow } from './message-groups';
import { BUBBLE_PADDING, AVATAR_CORNER } from './bubble-shape';
import { motion, radius, space, swipeReply } from '../design/tokens';

const nativeRowsMode = process.env.EXPO_PUBLIC_NATIVE_ROWS ?? 'markdown';
export const nativeTextRows = nativeRowsMode === 'text' || nativeRowsMode === 'markdown';
export const nativeMarkdownRows = nativeRowsMode === 'markdown';

export type NativeTextRow = {
  key: string;
  human: boolean;
  first: boolean;
  last: boolean;
  body: string;
  time: string;
  markdown: boolean;
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
  paragraphGap: number;
  markdown?: object | undefined;
  touch?: NativeTouchStyle | undefined;
};

export type NativeTouchStyle = {
  pressHuman: string;
  pressBot: string;
  hintFill: string;
  hintInk: string;
  holdMs: number;
  swipeStart: number;
  swipeBackFail: number;
  swipeVerticalFail: number;
  swipeCommit: number;
  swipeReach: number;
  hintEnd: number;
  hintIcon: number;
  glyph: number;
};

export function nativeTouchStyle(
  color: { pressHuman: string; pressBot: string; hintFill: string; hintInk: string },
  glyph: number,
): NativeTouchStyle {
  return {
    ...color,
    holdMs: motion.lift,
    swipeStart: swipeReply.start,
    swipeBackFail: swipeReply.backFail,
    swipeVerticalFail: swipeReply.verticalFail,
    swipeCommit: swipeReply.commit,
    swipeReach: swipeReply.reach,
    hintEnd: space.x3,
    hintIcon: swipeReply.icon,
    glyph,
  };
}

const MARKDOWN = /[*_`#>|[\]~<\\]|^\s*([-+]|\d+[.)])\s|https?:\/\/|www\./m;
const NBSP = String.fromCharCode(0xa0);
const DELIVERED = `${NBSP}✓`;
const SOFT_BREAK = /[^\n]\n[^\n]/;
const UNSUPPORTED_MARKDOWN =
  /^\s*\|.*\|\s*$|!\[|\[[^\]]*\]\(|https?:\/\/|www\.|<[a-zA-Z!/]|\$|^ {0,3}(`{3}|~{3})/m;
const INDENTED_CODE = /(^|\n[ \t]*\n)( {4}|\t)\S/;

export function nativeMarkdown(body: string): boolean {
  return body.trim() !== '' && !UNSUPPORTED_MARKDOWN.test(body) && !INDENTED_CODE.test(body);
}

export function plainText(body: string): boolean {
  return body.trim() !== '' && !MARKDOWN.test(body);
}

export type NativeRowContext = {
  dm: boolean;
  selecting: boolean;
  latest: string | undefined;
  reading: ReadonlyMap<string, unknown>;
  markdown?: boolean;
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
  const human = message.author === 'human';
  const markdown = !human && context.markdown === true;
  if (markdown ? !nativeMarkdown(message.body) : !plainText(message.body)) return undefined;
  if (!human && !markdown && SOFT_BREAK.test(message.body.trim())) return undefined;
  const clock = bubbleTime(message.at);
  if (clock === '') return undefined;
  return {
    key: row.key,
    human,
    first: row.first,
    last: row.last,
    body: message.body,
    time: human ? `${clock}${DELIVERED}` : clock,
    markdown,
  };
}

export function nativeTextStyle(
  color: { accent: string; surface: string; onAccent: string; fg: string; muted: string },
  type: { body: { size: number; line: number }; meta: { size: number; line: number } },
  fontScale: number,
  markdown?: object,
  touch?: NativeTouchStyle,
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
    paragraphGap: space.x3,
    markdown,
    touch,
  };
}
