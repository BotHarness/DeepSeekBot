import { z } from 'zod';
import {
  initialGenuiDocumentState,
  parseGenuiDocument,
  validateGenuiDocumentReply,
  validateGenuiDocumentState,
  type GenuiDocument,
  type GenuiDocumentReply,
  type GenuiDocumentView,
} from './genui-document.js';

export const GENUI_LIMITS = Object.freeze({
  bytes: 65_536,
  rows: 100,
  columns: 8,
  elements: 12,
  selections: 20,
});
const identity = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const label = z.string().trim().min(1).max(200);
const reportSchema = z.strictObject({
  version: z.literal(1),
  snapshotId: identity,
  observedAt: z.iso.datetime({ offset: true }),
  title: label,
  predecessorMessageId: z.string().min(1).max(200).optional(),
  columns: z
    .array(z.strictObject({ id: identity, label, kind: z.enum(['text', 'number']) }))
    .min(1)
    .max(GENUI_LIMITS.columns),
  rows: z
    .array(
      z.strictObject({
        id: identity,
        values: z.record(z.string(), z.union([z.string().max(500), z.number().finite()])),
        details: z.string().max(2000).optional(),
      }),
    )
    .max(GENUI_LIMITS.rows),
  elements: z
    .array(
      z.discriminatedUnion('kind', [
        z.strictObject({
          kind: z.literal('metric'),
          label,
          value: z.union([z.string().max(200), z.number().finite()]),
        }),
        z.strictObject({
          kind: z.literal('table'),
          columnIds: z.array(identity).min(1).max(GENUI_LIMITS.columns),
        }),
        z.strictObject({
          kind: z.literal('bar-chart'),
          labelColumnId: identity,
          valueColumnId: identity,
        }),
      ]),
    )
    .min(1)
    .max(GENUI_LIMITS.elements),
});

export type GenuiReport = z.infer<typeof reportSchema>;
export const genuiReplySchema = z.strictObject({
  messageId: z.string().min(1).max(200),
  snapshotId: identity,
  selectedIds: z.array(identity).max(GENUI_LIMITS.selections),
  intent: z.enum(['continue', 'refresh']),
});
export type GenuiReply = z.infer<typeof genuiReplySchema>;
export const genuiViewSchema = z.strictObject({
  filter: z.string().max(120),
  sortColumnId: identity.nullable(),
  sortDirection: z.enum(['asc', 'desc']),
  view: z.enum(['table', 'chart']),
  selectedIds: z.array(identity).max(GENUI_LIMITS.selections),
  expandedId: identity.nullable(),
});
export type GenuiViewState = z.infer<typeof genuiViewSchema>;
export interface GenuiView {
  version: number;
  state: GenuiViewState;
}

export type GenuiContent = GenuiReport | GenuiDocument;
export type GenuiMessageReply = GenuiReply | GenuiDocumentReply;
export type GenuiPrivateView = GenuiView | GenuiDocumentView;

export function parseGenuiContent(value: unknown): GenuiContent {
  return typeof value === 'object' && value !== null && 'version' in value && value.version === 2
    ? parseGenuiDocument(value)
    : parseGenuiReport(value);
}

export function validateGenuiMessageReply(
  content: GenuiContent,
  value: unknown,
): GenuiMessageReply {
  return content.version === 2
    ? validateGenuiDocumentReply(content, value)
    : validateGenuiReply(content, value);
}

export function genuiPrivateView(
  content: GenuiContent,
  version: number,
  value?: unknown,
): GenuiPrivateView {
  return content.version === 2
    ? {
        version,
        state:
          value === undefined
            ? initialGenuiDocumentState(content)
            : validateGenuiDocumentState(content, value),
      }
    : {
        version,
        state: value === undefined ? initialGenuiView() : validateGenuiView(content, value),
      };
}

export class GenuiError extends Error {
  constructor(
    readonly code: 'invalid-genui' | 'genui-unavailable' | 'genui-view-conflict',
    message: string,
  ) {
    super(message);
    this.name = 'GenuiError';
  }
}

export function parseGenuiReport(value: unknown): GenuiReport {
  const json = JSON.stringify(value);
  if (json === undefined || new TextEncoder().encode(json).length > GENUI_LIMITS.bytes)
    throw new GenuiError('invalid-genui', 'Report exceeds the 64 KiB budget.');
  const result = reportSchema.safeParse(value);
  if (!result.success)
    throw new GenuiError('invalid-genui', 'Invalid report structure or resource limits.');
  const report = result.data;
  const columns = new Map(report.columns.map((column) => [column.id, column]));
  if (
    columns.size !== report.columns.length ||
    new Set(report.rows.map((row) => row.id)).size !== report.rows.length
  )
    throw new GenuiError('invalid-genui', 'Report identities must be unique.');
  for (const row of report.rows) {
    if (
      Object.keys(row.values).length !== columns.size ||
      report.columns.some(
        (column) =>
          typeof row.values[column.id] !== (column.kind === 'number' ? 'number' : 'string'),
      )
    )
      throw new GenuiError('invalid-genui', 'Every row must match the declared columns.');
  }
  for (const element of report.elements) {
    if (
      element.kind === 'table' &&
      (new Set(element.columnIds).size !== element.columnIds.length ||
        element.columnIds.some((id) => !columns.has(id)))
    )
      throw new GenuiError('invalid-genui', 'Unknown or repeated table columns.');
    if (
      element.kind === 'bar-chart' &&
      (columns.get(element.labelColumnId)?.kind !== 'text' ||
        columns.get(element.valueColumnId)?.kind !== 'number')
    )
      throw new GenuiError(
        'invalid-genui',
        'A chart requires a text label and a numeric value column.',
      );
  }
  return report;
}

export function initialGenuiView(): GenuiViewState {
  return {
    filter: '',
    sortColumnId: null,
    sortDirection: 'asc',
    view: 'table',
    selectedIds: [],
    expandedId: null,
  };
}

export function validateGenuiView(report: GenuiReport, value: unknown): GenuiViewState {
  const parsed = genuiViewSchema.safeParse(value);
  if (!parsed.success) throw new GenuiError('invalid-genui', 'Invalid private view.');
  const state = parsed.data;
  const ids = new Set(report.rows.map((row) => row.id));
  if (
    new Set(state.selectedIds).size !== state.selectedIds.length ||
    state.selectedIds.some((id) => !ids.has(id)) ||
    (state.expandedId !== null && !ids.has(state.expandedId)) ||
    (state.sortColumnId !== null &&
      !report.columns.some((column) => column.id === state.sortColumnId))
  )
    throw new GenuiError('invalid-genui', 'Unknown report item or column reference.');
  return state;
}

export function validateGenuiReply(report: GenuiReport, value: unknown): GenuiReply {
  const parsed = genuiReplySchema.safeParse(value);
  if (!parsed.success || parsed.data.snapshotId !== report.snapshotId)
    throw new GenuiError('invalid-genui', 'The report snapshot does not match.');
  validateGenuiView(report, { ...initialGenuiView(), selectedIds: parsed.data.selectedIds });
  return parsed.data;
}
