import { File, Paths } from 'expo-file-system';

export type LastSession = {
  hostId: string;
  sessionId: string;
  slug?: string | undefined;
  title?: string | undefined;
};

const file = () => new File(Paths.document, 'deepseekbot-last-session.json');
let last: LastSession | null | undefined;

function valid(value: unknown): value is LastSession {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.hostId === 'string' &&
    typeof row.sessionId === 'string' &&
    (row.slug === undefined || typeof row.slug === 'string') &&
    (row.title === undefined || typeof row.title === 'string')
  );
}

export function lastSession(): LastSession | undefined {
  if (last === undefined) {
    try {
      const stored = file();
      const value: unknown = stored.exists ? JSON.parse(stored.textSync()) : undefined;
      last = valid(value) ? value : null;
    } catch {
      last = null;
    }
  }
  return last ?? undefined;
}

export function rememberLastSession(next: LastSession): void {
  const current = lastSession();
  if (
    current?.hostId === next.hostId &&
    current.sessionId === next.sessionId &&
    current.slug === next.slug &&
    current.title === next.title
  )
    return;
  last = next;
  try {
    file().writeSync(JSON.stringify(next));
  } catch {}
}
