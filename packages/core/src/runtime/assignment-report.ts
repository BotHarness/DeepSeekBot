import { createHash } from 'node:crypto';
import { z } from 'zod';

export const REPORT_PAGE_CHARACTERS = 2_000;
export const REPORT_EVENT_READ_LIMIT = 64;
const MAX_INLINE_REPORT_BYTES = 2_048;
const MAX_REPORT_BYTES = 1_048_576;
const REPORT_PREVIEW_CHARACTERS = 400;

const reportContentSchema = z.object({
  version: z.literal(1),
  bytes: z.number().int().min(1).max(MAX_REPORT_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  spill: z.object({ locator: z.string(), retrievalHint: z.string() }).optional(),
});

export type AssignmentReportContent = z.infer<typeof reportContentSchema>;
export type SaveReportSpill = (input: {
  sessionId: string;
  content: string;
}) => Promise<{ locator: string; bytes: number; retrievalHint: string }>;

export function parseReportContent(
  payloadJson: string | null,
): AssignmentReportContent | undefined {
  if (payloadJson === null) return undefined;
  const payload: unknown = JSON.parse(payloadJson);
  if (!isRecord(payload)) throw new Error('Invalid Assignment report payload');
  if (!Object.hasOwn(payload, 'assignmentReport')) return undefined;
  const report = payload.assignmentReport;
  if (!isRecord(report)) throw new Error('Invalid Assignment report payload');
  if (!Object.hasOwn(report, 'content')) return undefined;
  return reportContentSchema.parse(report.content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function prepareAssignmentReport(
  sessionId: string,
  text: string,
  saveSpill?: SaveReportSpill,
):
  | { summary: string; content: AssignmentReportContent }
  | Promise<{ summary: string; content: AssignmentReportContent }> {
  const normalized = text.trim();
  if (!normalized) throw new TypeError('Assignment report summary must not be blank');
  const bytes = Buffer.byteLength(normalized, 'utf8');
  if (bytes > MAX_REPORT_BYTES)
    throw new Error(`Assignment report exceeds ${MAX_REPORT_BYTES} bytes`);
  const content: AssignmentReportContent = {
    version: 1,
    bytes,
    sha256: createHash('sha256').update(normalized).digest('hex'),
  };
  if (bytes <= MAX_INLINE_REPORT_BYTES) return { summary: normalized, content };
  if (saveSpill === undefined) throw new Error('Assignment report spill storage is unavailable');
  return saveSpill({ sessionId, content: normalized }).then((spill) => {
    if (spill.bytes !== bytes) throw new Error('Assignment report spill byte count mismatch');
    content.spill = { locator: spill.locator, retrievalHint: spill.retrievalHint };
    const preview = Array.from(normalized).slice(0, REPORT_PREVIEW_CHARACTERS).join('');
    return {
      summary: `${preview}…\n[Full report: ${bytes} bytes; sha256: ${content.sha256}; locator: ${spill.locator}; ${spill.retrievalHint}]`,
      content,
    };
  });
}

export function acceptedReportText(
  text: string,
  summary: string,
  content?: AssignmentReportContent,
): string | undefined {
  const normalized = text.trim();
  if (content !== undefined)
    return Buffer.byteLength(normalized, 'utf8') === content.bytes &&
      createHash('sha256').update(normalized).digest('hex') === content.sha256
      ? normalized
      : undefined;
  const footer = /…\n\[Full report: \d+ bytes; sha256: ([0-9a-f]{64}); locator: [^\n]+\]$/u.exec(
    summary,
  );
  for (const candidate of [text, normalized]) {
    if (candidate === summary) return candidate;
    if (
      footer !== null &&
      candidate.startsWith(summary.slice(0, footer.index)) &&
      createHash('sha256').update(candidate).digest('hex') === footer[1]
    )
      return candidate;
  }
  return undefined;
}
