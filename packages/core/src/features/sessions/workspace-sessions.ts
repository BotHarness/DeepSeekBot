import { posix, win32 } from 'node:path';
import { canonicalPath, within } from '../../workspaces/space-paths.js';
import {
  sessionDisplayTitle,
  summarizeSessionTranscript,
  type SessionTranscript,
} from '../../runtime/session-transcript.js';
import type { SessionOwnership } from '../../sessions/ownership.js';
import type { DshSessionEvent } from '../../sessions/source.js';
import type { NativeSessions } from './host-sessions.js';

export const SESSION_SEED_MAX = 50;
export const WORKSPACE_SESSION_LIST_MAX = 100;
const TOOL_DETAIL_CHARS = 160;
const TITLE_CHARS = 120;

export interface WorkspaceSessionSummary {
  sessionId: string;
  title?: string;
  cwd: string;
  lastActivityAt: string;
}

export interface WorkspaceSessionReader {
  list(roots: readonly string[]): Promise<WorkspaceSessionSummary[]>;
  read(roots: readonly string[], sessionId: string): Promise<string>;
}

export class WorkspaceSessionError extends Error {
  constructor(
    readonly code: 'session-not-found' | 'session-outside-grant' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceSessionError';
  }
}

export function sessionSeedIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > SESSION_SEED_MAX)
    return undefined;
  const ids = new Set<string>();
  for (const id of value) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id))
      return undefined;
    ids.add(id);
  }
  return [...ids].sort();
}

function canonical(path: string): string | undefined {
  try {
    return canonicalPath(path);
  } catch {
    return undefined;
  }
}

export function pathWithin(root: string, path: string): boolean {
  const base = canonical(root);
  const target = canonical(path);
  return base !== undefined && target !== undefined && within(base, target);
}

export function folderName(cwd: string): string {
  const paths = win32.isAbsolute(cwd) && !posix.isAbsolute(cwd) ? win32 : posix;
  return paths.basename(cwd) || paths.parse(cwd).root;
}

function isTranscriptEvent(event: DshSessionEvent): boolean {
  if (event.type !== 'user/message') return true;
  const data = event.data as { source?: { kind?: unknown }; message?: { source?: unknown } };
  const source = (data?.source ?? data?.message?.source) as { kind?: unknown } | undefined;
  return source?.kind !== 'agent-instructions' && source?.kind !== 'time-context';
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

function renderTool(item: Extract<SessionTranscript['items'][number], { kind: 'tool' }>): string {
  const target = item.command ?? item.path ?? item.url ?? item.detail;
  const detail =
    target === undefined
      ? ''
      : ' `' + oneLine(target, TOOL_DETAIL_CHARS).replaceAll('`', "'") + '`';
  return `- ${item.tool}${detail} (${item.status})`;
}

export function renderSessionMarkdown(session: {
  sessionId: string;
  title?: string;
  cwd?: string;
  transcript: SessionTranscript;
}): string {
  const title = oneLine(session.title ?? 'Untitled Session', TITLE_CHARS);
  const lines = [
    `# ${title}`,
    '',
    `DeepSeek Session \`${session.sessionId}\`${session.cwd === undefined ? '' : ` in \`${session.cwd}\``}.`,
  ];
  if (session.transcript.omitted > 0)
    lines.push('', `_${session.transcript.omitted} earlier entries are not shown._`);
  let tools: string[] = [];
  const flush = () => {
    if (tools.length === 0) return;
    lines.push('', 'Tools:', ...tools);
    tools = [];
  };
  for (const item of session.transcript.items) {
    if (item.kind === 'tool') {
      tools.push(renderTool(item));
      continue;
    }
    if (item.kind === 'input' && item.source === 'user') {
      flush();
      lines.push('', `## Human · ${item.at}`, '', item.text.trim());
    } else if (item.kind === 'reply' && item.text.trim().length > 0) {
      flush();
      lines.push('', `## Assistant · ${item.at}`, '', item.text.trim());
    }
  }
  flush();
  return lines.join('\n') + '\n';
}

export function createWorkspaceSessionReader(
  service: () => NativeSessions | undefined,
  ownership: Pick<SessionOwnership, 'resolve'>,
): WorkspaceSessionReader {
  const native = (): NativeSessions => {
    const found = service();
    if (found === undefined)
      throw new WorkspaceSessionError('unavailable', 'Host Sessions are unavailable.');
    return found;
  };
  const inside = (roots: readonly string[], cwd: string | undefined): cwd is string =>
    cwd !== undefined && roots.some((root) => pathWithin(root, cwd));
  return {
    async list(roots) {
      if (roots.length === 0) return [];
      const rows = await native().list();
      return rows
        .filter(
          (row) =>
            row.parentSessionId === undefined &&
            ownership.resolve(row.sessionId) === undefined &&
            inside(roots, row.cwd),
        )
        .sort((a, b) => (b.lastPromptAt ?? b.updatedAt) - (a.lastPromptAt ?? a.updatedAt))
        .slice(0, WORKSPACE_SESSION_LIST_MAX)
        .map((row) => ({
          sessionId: row.sessionId,
          ...(row.title === undefined ? {} : { title: row.title }),
          cwd: row.cwd!,
          lastActivityAt: new Date(row.lastPromptAt ?? row.updatedAt).toISOString(),
        }));
    },
    async read(roots, sessionId) {
      const sessions = native();
      const missing = new WorkspaceSessionError(
        'session-not-found',
        `No readable DeepSeek Session ${sessionId}.`,
      );
      if (ownership.resolve(sessionId) !== undefined) throw missing;
      let snapshot: Awaited<ReturnType<NativeSessions['read']>>;
      try {
        if (!(await sessions.isRoot(sessionId))) throw missing;
        snapshot = await sessions.read(sessionId);
      } catch {
        throw missing;
      }
      if (!inside(roots, snapshot.cwd))
        throw new WorkspaceSessionError(
          'session-outside-grant',
          `Session ${sessionId} did not work in one of your Workspace Grants.`,
        );
      const title = snapshot.title ?? sessionDisplayTitle(snapshot.events);
      return renderSessionMarkdown({
        sessionId,
        ...(title === undefined ? {} : { title }),
        cwd: snapshot.cwd,
        transcript: summarizeSessionTranscript({
          sessionId,
          events: snapshot.events.filter(isTranscriptEvent),
        }),
      });
    },
  };
}

export function sessionSeedMessage(
  sessions: readonly { sessionId: string; title?: string; cwd?: string }[],
  workspaces: readonly string[],
  language: 'zh' | 'en',
): string {
  const list = sessions.map((session) => {
    const title = oneLine(
      session.title ?? (language === 'zh' ? '未命名 Session' : 'Untitled Session'),
      TITLE_CHARS,
    );
    const where = session.cwd === undefined ? '' : `${folderName(session.cwd)}, `;
    return `- ${title} (${where}\`${session.sessionId}\`)`;
  });
  const folders = workspaces.map((path) => `- \`${path}\``);
  if (language === 'zh')
    return [
      '你是根据我在 DeepSeek 里的这些 Session 创建的，之后由你来负责这个项目。请用 `workspace_sessions` 工具逐个读完它们，了解项目本身、我的工作方式和偏好，然后：',
      '',
      '1. 在 SOUL.md 里写下你在这个项目里的角色、职责和工作方式；',
      '2. 在 MEMORY.md 和其他记忆文件里记下值得长期记住的事实和决定，只记要点，不要整段复制对话；',
      '3. 完成后用几句话告诉我你学到了什么，以及还有哪些不清楚的地方。',
      '',
      'Session：',
      ...list,
      '',
      '已授权给你的工作区：',
      ...folders,
    ].join('\n');
  return [
    'You were created from these DeepSeek Sessions of mine, and you will look after this project from now on. Read each of them with the `workspace_sessions` tool to learn the project, how I work and what I prefer. Then:',
    '',
    '1. Write your role, responsibilities and way of working on this project in SOUL.md.',
    '2. Record the facts and decisions worth keeping in MEMORY.md and other Memory files. Keep the key points; do not copy whole conversations.',
    '3. When you are done, tell me in a few sentences what you learned and what is still unclear.',
    '',
    'Sessions:',
    ...list,
    '',
    'Workspaces granted to you:',
    ...folders,
  ].join('\n');
}
