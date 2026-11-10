import { writeZip } from '../bots/zip-archive.js';
import type { LogDatabase } from '../logs/log-db.js';
import {
  diagnosticLogFiles,
  diagnosticLogRows,
  type DiagnosticLogEnvironment,
} from './diagnostic-log.js';
import { createDiagnosticRedactor } from './redaction.js';

export const BUG_REPORT_PATH = '/api/botharness/bug-report';
export const BUG_REPORT_FORMAT = 'tobs-bug-report';
export const BUG_REPORT_VERSION = 1;
export const BUG_REPORT_ISSUE_BASE =
  'https://github.com/BotHarness/DeepSeekBot/issues/new?template=01-bug.yml';

export const BUG_REPORT_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxAttachments: 20,
  titleChars: 200,
  descriptionChars: 8000,
  issueDescriptionChars: 2000,
  issueUrlChars: 6000,
  nameChars: 120,
  defaultHours: 24,
  maxHours: 168,
} as const;

export type BugReportErrorCode =
  | 'invalid-report'
  | 'report-too-large'
  | 'persistence-unavailable'
  | 'internal-error';

export class BugReportError extends Error {
  constructor(
    readonly code: BugReportErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface BugReportAttachment {
  name: string;
  type?: string;
  data: Uint8Array;
}

export interface BugReportInput {
  title: string;
  description: string;
  hours: number;
  attachments: readonly BugReportAttachment[];
}

export interface BugReportResult {
  archive: Buffer;
  fileName: string;
  issueUrl: string;
  manifest: Record<string, unknown>;
}

function stampOf(at: number): string {
  return new Date(at).toISOString().replace(/[:.]/gu, '-').slice(0, 16).replace('T', '-');
}

function attachmentName(raw: string, index: number, used: Set<string>): string {
  const base =
    (raw.split(/[\\/]/u).pop() ?? '')
      .normalize('NFC')
      .replace(/[<>:"|?*]/gu, '_')
      .replace(/\p{Cc}/gu, '_')
      .replace(/^\.+/u, '')
      .trim()
      .slice(-BUG_REPORT_LIMITS.nameChars) || `attachment-${index + 1}`;
  let name = base;
  for (let copy = 2; used.has(name.toLowerCase()); copy += 1) {
    const dot = base.lastIndexOf('.');
    name = dot > 0 ? `${base.slice(0, dot)}-${copy}${base.slice(dot)}` : `${base}-${copy}`;
  }
  used.add(name.toLowerCase());
  return name;
}

export function attachmentBytes(attachments: readonly { data: Uint8Array }[]): number {
  return attachments.reduce((total, file) => total + file.data.byteLength, 0);
}

export function validateBugReport(input: BugReportInput): BugReportInput {
  const title = input.title.trim();
  const description = input.description.trim();
  if (title === '' && description === '')
    throw new BugReportError('invalid-report', 'Write a title or describe what happened.');
  if (title.length > BUG_REPORT_LIMITS.titleChars)
    throw new BugReportError(
      'invalid-report',
      `The title is longer than ${BUG_REPORT_LIMITS.titleChars} characters.`,
    );
  if (description.length > BUG_REPORT_LIMITS.descriptionChars)
    throw new BugReportError(
      'invalid-report',
      `The description is longer than ${BUG_REPORT_LIMITS.descriptionChars} characters.`,
    );
  if (!Number.isFinite(input.hours) || input.hours < 0 || input.hours > BUG_REPORT_LIMITS.maxHours)
    throw new BugReportError(
      'invalid-report',
      `hours must be between 0 and ${BUG_REPORT_LIMITS.maxHours}.`,
    );
  if (input.attachments.length > BUG_REPORT_LIMITS.maxAttachments)
    throw new BugReportError(
      'invalid-report',
      `Attach at most ${BUG_REPORT_LIMITS.maxAttachments} files.`,
    );
  if (attachmentBytes(input.attachments) > BUG_REPORT_LIMITS.maxBytes)
    throw new BugReportError(
      'report-too-large',
      'The attachments are larger than 25 MB, the most GitHub accepts for one file.',
    );
  return { ...input, title, description };
}

export function environmentLine(environment: DiagnosticLogEnvironment, client?: string): string {
  return [
    `Tobs ${environment.version}`,
    ...(environment.dshVersion === undefined ? [] : [`DSH ${environment.dshVersion}`]),
    `${environment.platform} ${environment.arch}`,
    `Node ${environment.node}`,
    ...(client === undefined || client === '' ? [] : [client]),
  ].join(' · ');
}

export function bugReportIssueUrl(options: {
  title: string;
  description: string;
  environment: string;
  fileName: string;
}): string {
  const build = (behavior: string) =>
    `${BUG_REPORT_ISSUE_BASE}&${new URLSearchParams({
      title: options.title,
      environment: `${options.environment}\nReport bundle: ${options.fileName}`,
      behavior,
      evidence: `Drag ${options.fileName} here before submitting.`,
    })}`;
  let kept = [...options.description].slice(0, BUG_REPORT_LIMITS.issueDescriptionChars);
  let url = build(
    kept.length < [...options.description].length ? `${kept.join('')}…` : options.description,
  );
  while (url.length > BUG_REPORT_LIMITS.issueUrlChars && kept.length > 0) {
    kept = kept.slice(0, Math.floor(kept.length * 0.8));
    url = build(`${kept.join('')}…`);
  }
  return url;
}

export function buildBugReport(
  input: BugReportInput,
  options: {
    database: Pick<LogDatabase, 'range'> | undefined;
    environment: DiagnosticLogEnvironment;
    homes: ReadonlyArray<{ path: string; label: string }>;
    client?: string;
    now?: () => number;
    exportedBy: 'host' | 'cli-offline';
  },
): BugReportResult {
  const report = validateBugReport(input);
  const until = (options.now ?? Date.now)();
  const redactor = createDiagnosticRedactor({ homes: options.homes });
  const title = redactor.text(report.title);
  const description = redactor.text(report.description);
  const client = options.client === undefined ? undefined : redactor.text(options.client);
  const encoder = new TextEncoder();
  const files: Array<{ path: string; data: Uint8Array }> = [];
  let logs: Record<string, unknown> = { included: false };
  if (report.hours > 0) {
    if (options.database === undefined)
      throw new BugReportError(
        'persistence-unavailable',
        'The diagnostic log is unavailable; send the report without logs (hours 0).',
      );
    const { rows, since, truncated } = diagnosticLogRows(options.database, report.hours, until);
    const built = diagnosticLogFiles(rows, {
      since,
      until,
      truncated,
      environment: options.environment,
      homes: options.homes,
      exportedBy: options.exportedBy,
    });
    for (const file of built.files)
      files.push({ path: `diagnostic-logs/${file.path}`, data: file.data });
    logs = {
      included: true,
      hours: report.hours,
      entries: built.manifest['entries'],
      truncated,
    };
  }
  const used = new Set<string>();
  const attachments = report.attachments.map((file, index) => {
    const name = attachmentName(file.name, index, used);
    files.push({ path: `attachments/${name}`, data: file.data });
    return { name, bytes: file.data.byteLength, ...(file.type ? { type: file.type } : {}) };
  });
  const fileName = `tobs-report-${stampOf(until)}.zip`;
  const environment = environmentLine(options.environment, client);
  const manifest = {
    format: BUG_REPORT_FORMAT,
    version: BUG_REPORT_VERSION,
    createdAt: new Date(until).toISOString(),
    createdBy: options.exportedBy,
    title,
    environment: options.environment,
    ...(client === undefined ? {} : { client }),
    logs,
    attachments,
    redaction: { level: redactor.level, hits: redactor.report() },
  };
  const report_md = [
    `# ${title || 'Bug report'}`,
    '',
    `- Environment: ${environment}`,
    `- Created: ${manifest.createdAt}`,
    '',
    '## What happened',
    '',
    description || '(no description)',
    '',
  ].join('\n');
  files.unshift(
    { path: 'manifest.json', data: encoder.encode(JSON.stringify(manifest, null, 2) + '\n') },
    { path: 'report.md', data: encoder.encode(report_md) },
  );
  const archive = writeZip(files);
  if (archive.byteLength > BUG_REPORT_LIMITS.maxBytes)
    throw new BugReportError(
      'report-too-large',
      'The report is larger than 25 MB, the most GitHub accepts for one file. Remove attachments or include fewer hours of logs.',
    );
  return {
    archive,
    fileName,
    manifest,
    issueUrl: bugReportIssueUrl({ title, description, environment, fileName }),
  };
}

interface MultipartFile {
  name: string;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface MultipartForm {
  get(name: string): unknown;
  getAll(name: string): unknown[];
}

function isMultipartFile(value: unknown): value is MultipartFile {
  return typeof value === 'object' && value !== null && 'arrayBuffer' in value;
}

export async function parseBugReportForm(request: Request): Promise<{
  input: BugReportInput;
  client?: string;
}> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > BUG_REPORT_LIMITS.maxBytes + 1024 * 1024)
    throw new BugReportError('report-too-large', 'The report is larger than 25 MB.');
  const form = (await request.formData().catch(() => undefined)) as MultipartForm | undefined;
  if (form === undefined)
    throw new BugReportError('invalid-report', 'Send the report as multipart form data.');
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };
  const hoursRaw = field('hours');
  const attachments: BugReportAttachment[] = [];
  for (const value of form.getAll('attachment')) {
    if (!isMultipartFile(value)) continue;
    attachments.push({
      name: value.name,
      ...(value.type ? { type: value.type } : {}),
      data: new Uint8Array(await value.arrayBuffer()),
    });
    if (attachmentBytes(attachments) > BUG_REPORT_LIMITS.maxBytes)
      throw new BugReportError('report-too-large', 'The attachments are larger than 25 MB.');
  }
  const client = field('client').slice(0, 200);
  return {
    input: {
      title: field('title'),
      description: field('description'),
      hours: hoursRaw === '' ? BUG_REPORT_LIMITS.defaultHours : Number(hoursRaw),
      attachments,
    },
    ...(client === '' ? {} : { client }),
  };
}

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

export function createBugReportHttp(options: {
  database(): LogDatabase | undefined;
  flush?(): void;
  environment: DiagnosticLogEnvironment;
  homes: ReadonlyArray<{ path: string; label: string }>;
  now?: () => number;
  log?: (message: string) => void;
}) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: HEADERS });
    try {
      const { input, client } = await parseBugReportForm(request);
      options.flush?.();
      const built = buildBugReport(input, {
        database: options.database(),
        environment: options.environment,
        homes: options.homes,
        ...(client === undefined ? {} : { client }),
        ...(options.now === undefined ? {} : { now: options.now }),
        exportedBy: 'host',
      });
      options.log?.(
        `bug-report initiator=human phase=built attachments=${input.attachments.length} hours=${input.hours} bytes=${built.archive.byteLength}`,
      );
      return new Response(new Uint8Array(built.archive), {
        headers: {
          ...HEADERS,
          'content-type': 'application/zip',
          'content-length': String(built.archive.byteLength),
          'content-disposition': `attachment; filename="${built.fileName}"`,
          'x-bug-report-issue-url': built.issueUrl,
          'x-bug-report-file': built.fileName,
        },
      });
    } catch (error) {
      const known = error instanceof BugReportError;
      const code = known ? error.code : 'internal-error';
      options.log?.(
        known
          ? `bug-report phase=refused reason=${code}`
          : `bug-report phase=failed reason=${code} cause=${error instanceof Error ? error.name : typeof error}`,
      );
      return Response.json(
        {
          error: {
            code,
            message: known ? error.message : 'Could not build the report.',
          },
        },
        {
          status:
            code === 'report-too-large'
              ? 413
              : code === 'persistence-unavailable'
                ? 503
                : code === 'internal-error'
                  ? 500
                  : 400,
          headers: HEADERS,
        },
      );
    }
  };
}
