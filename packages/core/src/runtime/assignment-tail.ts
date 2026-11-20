import {
  acceptedReportText,
  REPORT_PAGE_CHARACTERS,
  REPORT_EVENT_READ_LIMIT,
  type AssignmentReportContent,
} from './assignment-report.js';

import type { AssignmentEventTail } from './bot-runtime.js';

export interface AssignmentSessionQuery {
  listEvents(sessionId: string): Promise<Array<{ seq: number; type: string }>>;
  filterEvents(
    sessionId: string,
    filters: Array<{ kind: 'type'; values: string[] } | { kind: 'text'; text: string }>,
  ): Promise<Array<{ seq: number }>>;
  readEvent(input: { sessionId: string; seq: number }): Promise<{ target: unknown }>;
}

export interface AssignmentReportPage {
  text: string;
  offset: number;
  nextOffset?: number;
  totalCharacters: number;
  matchedEvents: number;
  readCount: number;
  sourceEventBytes: number;
  returnedCharacters: number;
  estimatedTokens: number;
}

export async function readAssignmentReportPage(
  query: AssignmentSessionQuery,
  sessionId: string,
  acceptedSummary: string,
  offset: number,
  content?: AssignmentReportContent,
): Promise<AssignmentReportPage> {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid report offset');
  const matches = await query.filterEvents(sessionId, [
    { kind: 'type', values: ['tool/call'] },
    { kind: 'text', text: 'report_to_orchestrator' },
  ]);
  let readCount = 0;
  let sourceEventBytes = 0;
  for (const match of matches.slice(-REPORT_EVENT_READ_LIMIT).reverse()) {
    const { target } = await query.readEvent({ sessionId, seq: match.seq });
    readCount += 1;
    sourceEventBytes += Buffer.byteLength(JSON.stringify(target) ?? 'null', 'utf8');
    if (!isRecord(target) || target.type !== 'tool/call' || !isRecord(target.data)) continue;
    if (target.data.name !== 'report_to_orchestrator' || typeof target.data.arguments !== 'string')
      continue;
    let argumentsValue: unknown;
    try {
      argumentsValue = JSON.parse(target.data.arguments);
    } catch {
      continue;
    }
    if (!isRecord(argumentsValue) || typeof argumentsValue.summary !== 'string') continue;
    const summary = acceptedReportText(argumentsValue.summary, acceptedSummary, content);
    if (summary === undefined) continue;
    const characters = Array.from(summary);
    const text = characters.slice(offset, offset + REPORT_PAGE_CHARACTERS).join('');
    const nextOffset = offset + Array.from(text).length;
    return {
      text,
      offset,
      ...(nextOffset < characters.length ? { nextOffset } : {}),
      totalCharacters: characters.length,
      matchedEvents: matches.length,
      readCount,
      sourceEventBytes,
      returnedCharacters: Array.from(text).length,
      estimatedTokens: Math.ceil(Array.from(text).length / 4),
    };
  }
  throw new Error('Accepted Assignment report was not found in DSH Session Query');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readBoundedAssignmentTail(
  query: AssignmentSessionQuery,
  sessionId: string,
): Promise<AssignmentEventTail> {
  const all = await query.listEvents(sessionId);
  const selected = all.slice(-4);
  const events: AssignmentEventTail['events'] = [];
  let sourceEventBytes = 0;
  for (const record of selected) {
    const read = await query.readEvent({ sessionId, seq: record.seq });
    const source = JSON.stringify(read.target) ?? 'null';
    const serialized = Array.from(source);
    sourceEventBytes += Buffer.byteLength(source, 'utf8');
    const length = Math.min(serialized.length, 3_000);
    events.push({
      seq: record.seq,
      type: record.type,
      text: serialized.slice(0, length).join(''),
      truncated: length < serialized.length,
    });
  }
  const returnedCharacters = events.reduce((total, event) => total + event.text.length, 0);
  return {
    events,
    indexedEvents: all.length,
    readCount: events.length,
    sourceEventBytes,
    returnedCharacters,
    estimatedTokens: Math.ceil(returnedCharacters / 4),
  };
}
