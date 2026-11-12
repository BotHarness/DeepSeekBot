import type { Annotation } from './bug-report-annotate.js';

export const BUG_REPORT_ENDPOINT = './api/botharness/bug-report';
export const BUG_REPORT_MAX_BYTES = 25 * 1024 * 1024;
export const BUG_REPORT_MAX_FILES = 20;
export const BUG_REPORT_HOURS = ['1', '24', '72', '168'] as const;
export type BugReportHours = (typeof BUG_REPORT_HOURS)[number];

export interface BugReportFile {
  readonly id: string;
  readonly file: File;
  readonly preview?: string;
  readonly note?: string;
  readonly markup?: BugReportMarkup;
}

export interface BugReportMarkup {
  readonly original: File;
  readonly annotations: readonly Annotation[];
}

export const BUG_REPORT_NOTE_CHARS = 200;
const DESCRIPTION_CHARS = 8000;

export interface BugReportDraft {
  readonly title: string;
  readonly description: string;
  readonly includeLogs: boolean;
  readonly hours: BugReportHours;
  readonly files: readonly BugReportFile[];
}

export interface BugReportReceipt {
  readonly fileName: string;
  readonly bytes: number;
  readonly issueUrl: string;
}

export function reportBytes(files: readonly BugReportFile[]): number {
  return files.reduce((total, entry) => total + entry.file.size, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

let sequence = 0;

export function pastedName(file: File, now = new Date()): string {
  if (file.name !== '' && file.name !== 'image.png') return file.name;
  const pad = (value: number) => String(value).padStart(2, '0');
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  return `pasted-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${extension}`;
}

export function addReportFiles(
  current: readonly BugReportFile[],
  incoming: readonly File[],
  preview: (file: File) => string | undefined,
): { files: BugReportFile[]; skipped: number } {
  const room = Math.max(0, BUG_REPORT_MAX_FILES - current.length);
  const accepted = incoming.slice(0, room).map((file) => {
    sequence += 1;
    const url = file.type.startsWith('image/') ? preview(file) : undefined;
    return { id: `file-${sequence}`, file, ...(url === undefined ? {} : { preview: url }) };
  });
  return { files: [...current, ...accepted], skipped: incoming.length - accepted.length };
}

export function bugReportForm(draft: BugReportDraft, client: string): FormData {
  const form = new FormData();
  form.set('title', draft.title.trim());
  form.set('description', describeAttachments(draft.description, draft.files));
  form.set('hours', draft.includeLogs ? draft.hours : '0');
  form.set('client', client);
  for (const entry of draft.files) form.append('attachment', entry.file, entry.file.name);
  return form;
}

export function describeAttachments(description: string, files: readonly BugReportFile[]): string {
  const notes = files.flatMap((entry) => {
    const note = entry.note?.trim() ?? '';
    return note === '' ? [] : [`- ${entry.file.name}: ${note}`];
  });
  const body = description.trim();
  if (notes.length === 0) return body;
  const section = ['Attachment notes:', ...notes].join('\n');
  return (body === '' ? section : `${body}\n\n${section}`).slice(0, DESCRIPTION_CHARS);
}

export function clientDescription(navigatorLike: { userAgent?: string } | undefined): string {
  const agent = navigatorLike?.userAgent ?? '';
  const match =
    /(Edg|OPR|Chrome|Firefox|Version)\/(\d+)/u.exec(agent) ?? /(Safari)\/(\d+)/u.exec(agent);
  if (match === null) return 'Web';
  const name =
    match[1] === 'Edg'
      ? 'Edge'
      : match[1] === 'OPR'
        ? 'Opera'
        : match[1] === 'Version'
          ? 'Safari'
          : match[1];
  return `Web · ${name} ${match[2]}`;
}

export async function submitBugReport(
  draft: BugReportDraft,
  client: string,
  fetcher: typeof fetch = fetch,
): Promise<{ receipt: BugReportReceipt; blob: Blob }> {
  const response = await fetcher(BUG_REPORT_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    body: bugReportForm(draft, client),
  });
  if (!response.ok) {
    let code = String(response.status);
    try {
      const value = (await response.json()) as { error?: { code?: string } };
      code = value.error?.code ?? code;
    } catch {}
    throw new Error(code);
  }
  const blob = await response.blob();
  return {
    blob,
    receipt: {
      fileName: response.headers.get('x-bug-report-file') ?? 'tobs-report.zip',
      bytes: blob.size,
      issueUrl: response.headers.get('x-bug-report-issue-url') ?? '',
    },
  };
}
