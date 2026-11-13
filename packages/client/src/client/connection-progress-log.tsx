import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { DIAGNOSTIC_LOGS_ENDPOINT } from './diagnostic-log.js';
import type { DiagnosticLogRow } from './diagnostic-logs-dialog.js';
import { useMountedResource } from './mounted-resource.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  panel: { width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: space.x2 },
  title: { fontSize: text.bodySize, fontWeight: text.strong },
  log: {
    margin: 0,
    padding: space.x3,
    listStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: color.well,
    maxHeight: '180px',
    overflowY: 'auto',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  row: { display: 'flex', gap: space.x3, paddingBlock: space.x1 },
  time: { color: color.muted, flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
  note: { margin: 0, color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
});

const phaseLabels = {
  'cloudflared-download': 'connections.log.download',
  'cloudflared-installed': 'connections.log.installed',
  'cloudflared-started': 'connections.log.started',
  'cloudflared-exited': 'connections.log.restarting',
  'cloudflared-missing': 'connections.log.missing',
  'origin-port-busy': 'connections.log.portBusy',
  'account-error': 'connections.log.accountError',
  'account-connect-error': 'connections.log.accountError',
  'sign-in-expired': 'connections.log.signInExpired',
  'signed-out': 'connections.log.signedOut',
  connected: 'connections.log.verified',
  enabled: 'connections.log.enabled',
  disabled: 'connections.log.disabled',
  'quick-address': 'connections.log.address',
  'ingress-started': 'connections.log.ingress',
  verified: 'connections.log.verified',
  'probe-started': 'connections.log.probeStarted',
  'probe-failed': 'connections.log.probeFailed',
  unreachable: 'connections.log.unreachable',
  'sign-in-started': 'connections.log.signIn',
  'signed-in': 'connections.log.signedIn',
  linked: 'connections.log.linked',
} as const;

type ProgressRow = {
  id: number;
  ts: number;
  phase: string;
  route?: string;
  attempt?: number;
  seconds?: number;
  probe?: string;
};
export function connectionProgressRows(
  rows: DiagnosticLogRow[],
  source: string,
  since: number,
): ProgressRow[] {
  return rows
    .flatMap((row) => {
      if (row.source !== source || row.ts < since) return [];
      const phase =
        row.category === 'module'
          ? (/(?:^|\s)phase=([a-z][a-z0-9-]{0,79})(?:\s|$)/u.exec(row.code)?.[1] ?? row.code)
          : row.code;
      if (!/^[a-z][a-z0-9-]{0,79}$/u.test(phase)) return [];
      const route = /(?:^|\s)route=(quick|custom)(?:\s|$)/u.exec(row.code)?.[1];
      const attempt = /(?:^|\s)attempt=(\d{1,4})(?:\s|$)/u.exec(row.code)?.[1];
      const elapsed = /(?:^|\s)elapsedMs=(\d{1,9})(?:\s|$)/u.exec(row.code)?.[1];
      const probe =
        /(?:^|\s)probe=(dns|timeout|tls|network|challenge-mismatch|http-\d{3})(?:\s|$)/u.exec(
          row.code,
        )?.[1];
      return [
        {
          id: row.id,
          ts: row.ts,
          phase,
          ...(route ? { route } : {}),
          ...(attempt && elapsed
            ? { attempt: Number(attempt), seconds: Math.round(Number(elapsed) / 1000) }
            : {}),
          ...(probe ? { probe } : {}),
        },
      ];
    })
    .sort((a, b) => b.id - a.id)
    .slice(0, 40);
}

export function ConnectionProgressLog({
  t,
  source,
}: PropsLocale<'botharness'> & { source: string }): ReactElement {
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const mount = useMountedResource<HTMLElement>(() => {
    const since = Date.now() - 15 * 60 * 1000;
    let cursor = since;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        if (document.visibilityState !== 'hidden') {
          const response = await fetch(
            `${DIAGNOSTIC_LOGS_ENDPOINT}?filter=all&since=${cursor}&limit=500`,
            { signal: abort.signal, credentials: 'same-origin' },
          );
          if (!response.ok) throw new Error('log-unavailable');
          const value = (await response.json()) as {
            entries?: DiagnosticLogRow[];
            completeness?: { primary?: string; status?: string };
          };
          if (!Array.isArray(value.entries)) throw new Error('log-unavailable');
          if (!abort.signal.aborted) {
            const next = connectionProgressRows(value.entries, source, since);
            cursor = Math.max(cursor, ...value.entries.map((row) => row.ts));
            setRows((previous) =>
              [...new Map([...previous, ...next].map((row) => [row.id, row])).values()]
                .filter((row) => row.ts >= Date.now() - 15 * 60 * 1000)
                .sort((a, b) => b.id - a.id)
                .slice(0, 40),
            );
            setUnavailable(
              value.completeness?.primary === 'unavailable' ||
                value.completeness?.status === 'partial',
            );
          }
        }
      } catch {
        if (!abort.signal.aborted) setUnavailable(true);
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 2000);
      }
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [source]);
  return (
    <section ref={mount} {...stylex.props(styles.panel)} aria-label={t('connections.log.title')}>
      <strong {...stylex.props(styles.title)}>{t('connections.log.title')}</strong>
      {unavailable ? (
        <p role="status" {...stylex.props(styles.note)}>
          {t('connections.log.unavailable')}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p {...stylex.props(styles.note)}>{t('connections.log.waiting')}</p>
      ) : (
        <ol {...stylex.props(styles.log)} aria-live="polite" aria-relevant="additions">
          {rows.map((row) => (
            <li key={row.id} {...stylex.props(styles.row)}>
              <time {...stylex.props(styles.time)} dateTime={new Date(row.ts).toISOString()}>
                {new Date(row.ts).toLocaleTimeString()}
              </time>
              <span>
                {row.route
                  ? `${row.route === 'quick' ? 'Quick Tunnel' : t('connections.log.custom')}: `
                  : ''}
                {Object.hasOwn(phaseLabels, row.phase)
                  ? t(phaseLabels[row.phase as keyof typeof phaseLabels])
                  : t('connections.log.updated')}
                {row.attempt !== undefined
                  ? ` · ${t('connections.log.attempt', { attempt: row.attempt, seconds: row.seconds ?? 0 })}`
                  : ''}
                {row.probe
                  ? ` · ${row.probe.startsWith('http-') ? t('connections.log.http') : t(row.probe === 'dns' ? 'connections.log.dns' : row.probe === 'timeout' ? 'connections.log.timeout' : row.probe === 'tls' ? 'connections.log.tls' : row.probe === 'challenge-mismatch' ? 'connections.log.mismatch' : 'connections.log.network')}`
                  : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
