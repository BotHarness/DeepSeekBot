import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import {
  BUG_REPORT_LIMITS,
  BUG_REPORT_PATH,
  BugReportError,
  buildBugReport,
  validateBugReport,
  type BugReportAttachment,
  type BugReportInput,
} from '../diagnostics/bug-report.js';
import { LOG_DB_FILENAME, LogDatabaseUnreadableError, openLogDatabase } from '../logs/log-db.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import {
  diagnosticEnvironment,
  diagnosticHome,
  diagnosticHomes,
  hostConfigured,
  isOfflineFallback,
} from './cli-diagnostic-logs.js';
import type { connectLiveHost } from './cli-live.js';
import { CliLiveError } from './cli-live-error.js';

export const BUG_REPORT_COMMANDS = [
  {
    command: 'bug-report',
    description:
      'build a bug report ZIP (description, attachments, redacted diagnostic log, versions) and a prefilled GitHub issue link; --title, --body-stdin, --attach <file> (repeat), --hours 0-168, --out required; works without the Host',
  },
] as const;

const NEXT_STEP = 'Open issueUrl, then drag the report ZIP into the issue before submitting.';

function readAttachments(paths: readonly string[]): BugReportAttachment[] {
  if (paths.length > BUG_REPORT_LIMITS.maxAttachments)
    throw new CliLiveError('usage', `Attach at most ${BUG_REPORT_LIMITS.maxAttachments} files.`);
  let total = 0;
  return paths.map((path) => {
    let size: number;
    try {
      const stat = statSync(path);
      if (!stat.isFile()) throw new Error();
      size = stat.size;
    } catch {
      throw new CliLiveError('usage', `--attach ${basename(path)} is not a readable file.`);
    }
    total += size;
    if (total > BUG_REPORT_LIMITS.maxBytes)
      throw new CliLiveError(
        'report-too-large',
        'The attachments are larger than 25 MB, the most GitHub accepts for one file.',
      );
    return { name: basename(path), data: new Uint8Array(readFileSync(path)) };
  });
}

function buildOffline(
  input: BugReportInput,
  values: { home?: string },
  io: BotCreateCliIo,
): ReturnType<typeof buildBugReport> {
  const dshHome = diagnosticHome(values, io);
  const dir = join(dshHome, 'botharness');
  let database: ReturnType<typeof openLogDatabase> | undefined;
  if (input.hours > 0) {
    if (!existsSync(join(dir, LOG_DB_FILENAME)))
      throw new CliLiveError(
        'not-found',
        'No diagnostic log was found under DSH_HOME; pass --home, or --hours 0 to send the report without logs.',
      );
    try {
      database = openLogDatabase({ dir, readOnly: true });
    } catch (error) {
      if (error instanceof LogDatabaseUnreadableError)
        throw new CliLiveError(
          'log-unreadable',
          `The diagnostic log could not be read (${error.message}); pass --hours 0 to send the report without logs.`,
        );
      throw error;
    }
  }
  try {
    return buildBugReport(input, {
      database,
      environment: diagnosticEnvironment(),
      homes: diagnosticHomes(dshHome),
      exportedBy: 'cli-offline',
    });
  } catch (error) {
    if (error instanceof BugReportError) throw new CliLiveError(error.code, error.message);
    throw error;
  } finally {
    database?.close();
  }
}

export async function runBugReport(
  values: {
    out?: string;
    title?: string;
    'body-stdin'?: boolean;
    attach?: string[];
    hours?: string;
    offline?: boolean;
    home?: string;
    host?: string;
  },
  io: BotCreateCliIo,
  connect: () => Promise<Awaited<ReturnType<typeof connectLiveHost>>>,
): Promise<unknown> {
  if (!values.out) throw new CliLiveError('usage', 'Pass --out for the report ZIP.');
  if (existsSync(values.out))
    throw new CliLiveError('usage', 'The --out file already exists; choose a new path.');
  const hours = values.hours === undefined ? BUG_REPORT_LIMITS.defaultHours : Number(values.hours);
  if (!Number.isFinite(hours) || hours < 0 || hours > BUG_REPORT_LIMITS.maxHours)
    throw new CliLiveError('usage', '--hours must be between 0 and 168 (0 leaves the log out).');
  const description = values['body-stdin'] === true ? ((await io.readStdin?.()) ?? '') : '';
  const input: BugReportInput = {
    title: values.title ?? '',
    description,
    hours,
    attachments: readAttachments(values.attach ?? []),
  };
  try {
    validateBugReport(input);
  } catch (error) {
    if (error instanceof BugReportError)
      throw new CliLiveError(error.code === 'invalid-report' ? 'usage' : error.code, error.message);
    throw error;
  }
  const out = values.out;
  const offline = (fallback?: string) => {
    const built = buildOffline(input, values, io);
    writeFileSync(out, built.archive, { flag: 'wx', mode: 0o600 });
    return {
      saved: true,
      path: out,
      fileName: basename(out),
      bytes: built.archive.byteLength,
      attachments: input.attachments.length,
      logs: built.manifest['logs'],
      issueUrl: built.issueUrl.replaceAll(built.fileName, encodeURIComponent(basename(out))),
      nextStep: NEXT_STEP,
      source: 'offline',
      ...(fallback === undefined ? {} : { fallback }),
    };
  };
  if (values.offline === true) return offline();
  if (!hostConfigured(values, io)) return offline('host-not-configured');
  const form = new FormData();
  form.set('title', input.title);
  form.set('description', input.description);
  form.set('hours', String(hours));
  form.set('client', 'CLI');
  for (const file of input.attachments)
    form.append('attachment', new Blob([new Uint8Array(file.data)]), file.name);
  let response: Response;
  let bytes: Uint8Array;
  try {
    const host = await connect();
    response = await host.stream(BUG_REPORT_PATH, { method: 'POST', body: form });
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (isOfflineFallback(error)) return offline(error.code);
    throw error;
  }
  writeFileSync(out, bytes, { flag: 'wx', mode: 0o600 });
  const hostName = response.headers.get('x-bug-report-file') ?? '';
  const issueUrl = response.headers.get('x-bug-report-issue-url') ?? '';
  return {
    saved: true,
    path: out,
    fileName: basename(out),
    bytes: bytes.byteLength,
    attachments: input.attachments.length,
    issueUrl:
      hostName === '' ? issueUrl : issueUrl.replaceAll(hostName, encodeURIComponent(basename(out))),
    nextStep: NEXT_STEP,
    source: 'host',
  };
}
