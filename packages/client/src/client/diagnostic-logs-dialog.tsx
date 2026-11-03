import { useCallback, useId, useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  Button,
  IconCopyOutlineRegular,
  IconDownloadOutlineRegular,
  SegmentedControl,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { clientLog, DIAGNOSTIC_LOGS_ENDPOINT, logClient } from './diagnostic-log.js';
import { EmptyState } from './ds/empty-state.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export type DiagnosticLogFilter = 'all' | 'error' | 'perf' | 'action';

export interface DiagnosticLogRow {
  id: number;
  ts: number;
  source: string;
  category: string;
  level: string;
  code: string;
  session?: string;
  fields: Record<string, string | number | boolean | null>;
}

const FILTERS = {
  all: 'diagnosticLogs.filter.all',
  error: 'diagnosticLogs.filter.error',
  perf: 'diagnosticLogs.filter.perf',
  action: 'diagnosticLogs.filter.action',
} as const;

const TAGS = {
  action: 'diagnosticLogs.tag.action',
  navigation: 'diagnosticLogs.tag.navigation',
  error: 'diagnosticLogs.tag.error',
  perf: 'diagnosticLogs.tag.perf',
  invariant: 'diagnosticLogs.tag.invariant',
  lifecycle: 'diagnosticLogs.tag.lifecycle',
  network: 'diagnosticLogs.tag.network',
} as const;

function tagKey(row: DiagnosticLogRow) {
  if (row.source !== 'client') return 'diagnosticLogs.tag.host' as const;
  return TAGS[row.category as keyof typeof TAGS] ?? ('diagnosticLogs.tag.lifecycle' as const);
}

const styles = stylex.create({
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
  },
  meta: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '240px',
    maxHeight: 'min(56vh, 520px)',
    margin: 0,
    padding: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    listStyle: 'none',
    borderRadius: radius.md,
    backgroundColor: color.well,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '84px 64px minmax(0, 1fr)',
    columnGap: space.x3,
    alignItems: 'baseline',
    paddingBlock: space.x2,
    paddingInline: space.x4,
    borderBottomWidth: border.hairline,
    borderBottomStyle: 'solid',
    borderBottomColor: color.divider,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  time: {
    color: color.muted,
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  tag: {
    justifySelf: 'start',
    paddingInline: space.x2,
    borderRadius: radius.xs,
    backgroundColor: color.hover,
    color: color.muted,
    whiteSpace: 'nowrap',
  },
  tagWarn: { backgroundColor: color.warningSoft, color: color.warning },
  tagError: { backgroundColor: color.dangerSoft, color: color.danger },
  body: { minWidth: 0 },
  code: { color: color.fg, fontWeight: text.strong },
  fields: {
    display: 'block',
    color: color.muted,
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    overflowWrap: 'anywhere',
  },
  status: { color: color.muted, padding: space.x4 },
  error: { color: color.danger, padding: space.x4 },
});

function timeOf(ts: number): string {
  const date = new Date(ts);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function formatDiagnosticFields(fields: DiagnosticLogRow['fields']): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : String(value)}`)
    .join('  ');
}

export function diagnosticLogText(rows: readonly DiagnosticLogRow[]): string {
  return rows
    .map((row) =>
      [
        new Date(row.ts).toISOString(),
        row.level.toUpperCase(),
        `${row.source}.${row.category}`,
        row.code,
        formatDiagnosticFields(row.fields),
      ]
        .filter((part) => part !== '')
        .join('  '),
    )
    .join('\n');
}

async function readRows(filter: DiagnosticLogFilter, signal: AbortSignal) {
  await clientLog()?.flush();
  const response = await fetch(`${DIAGNOSTIC_LOGS_ENDPOINT}?filter=${filter}&limit=500`, {
    credentials: 'same-origin',
    signal,
  });
  const value = (await response.json()) as {
    entries?: DiagnosticLogRow[];
    error?: { code?: string };
  };
  if (!response.ok) throw new Error(value.error?.code ?? 'operation-failed');
  return value.entries ?? [];
}

export function DiagnosticLogsDialog({
  onClose,
  t,
}: {
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const [filter, setFilter] = useState<DiagnosticLogFilter>('all');
  const [rows, setRows] = useState<DiagnosticLogRow[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const active = useRef<AbortController | undefined>(undefined);

  const load = useCallback((next: DiagnosticLogFilter) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setError(undefined);
    readRows(next, controller.signal).then(
      (entries) => {
        if (!controller.signal.aborted) setRows(entries);
      },
      (failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : 'operation-failed');
      },
    );
  }, []);

  const mount = useMountedResource<HTMLDivElement>(() => {
    load('all');
    return () => active.current?.abort();
  }, [load]);

  const choose = (next: DiagnosticLogFilter) => {
    setFilter(next);
    setRows(undefined);
    load(next);
  };

  const copy = async () => {
    if (rows === undefined) return;
    try {
      await navigator.clipboard.writeText(diagnosticLogText([...rows].reverse()));
      setNotice(t('diagnosticLogs.copied'));
    } catch {
      setNotice(t('diagnosticLogs.copyFailed'));
    }
  };

  const download = async () => {
    setBusy(true);
    setNotice(undefined);
    try {
      await clientLog()?.flush();
      logClient('action', 'diagnostic-logs-export');
      await clientLog()?.flush();
      const response = await fetch(`${DIAGNOSTIC_LOGS_ENDPOINT}/export?hours=24`, {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const name =
        response.headers.get('content-disposition')?.match(/filename="([^"]+)"/u)?.[1] ??
        'deepseekbot-logs.zip';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice(t('diagnosticLogs.exported', { name }));
    } catch {
      setNotice(t('diagnosticLogs.exportFailed'));
    } finally {
      setBusy(false);
    }
  };

  const tone = (row: DiagnosticLogRow) =>
    row.level === 'error' ? styles.tagError : row.level === 'warn' ? styles.tagWarn : null;

  return (
    <PanelDialog
      title={t('diagnosticLogs.title')}
      description={t('diagnosticLogs.intro')}
      size="medium"
      closeLabel={t('diagnostics.close')}
      onClose={onClose}
      data={{ 'data-diagnostic-logs': '' }}
      secondary={
        <span role="status" {...stylex.props(styles.meta)}>
          {notice ?? ''}
        </span>
      }
      actions={
        <>
          <Button
            variant="ghost"
            onClick={() => void copy()}
            disabled={rows === undefined || rows.length === 0}
          >
            <IconCopyOutlineRegular size={16} />
            {t('diagnosticLogs.copy')}
          </Button>
          <Button variant="primary" onClick={() => void download()} disabled={busy}>
            <IconDownloadOutlineRegular size={16} />
            {t('diagnosticLogs.export')}
          </Button>
        </>
      }
    >
      <div ref={mount} {...stylex.props(styles.toolbar)}>
        <SegmentedControl
          id={id}
          label={t('diagnosticLogs.filter')}
          value={filter}
          options={(Object.keys(FILTERS) as DiagnosticLogFilter[]).map((value) => ({
            value,
            label: t(FILTERS[value]),
          }))}
          onChange={choose}
        />
        <span {...stylex.props(styles.meta)}>
          {rows === undefined ? '' : t('diagnosticLogs.count', { count: String(rows.length) })}
        </span>
      </div>
      <ul
        id={`${id}-${filter}-panel`}
        role="tabpanel"
        aria-label={t(FILTERS[filter])}
        {...stylex.props(styles.list)}
      >
        {error !== undefined ? (
          <li {...stylex.props(styles.error)}>{t('diagnosticLogs.failed', { code: error })}</li>
        ) : rows === undefined ? (
          <li {...stylex.props(styles.status)}>{t('diagnosticLogs.loading')}</li>
        ) : rows.length === 0 ? (
          <li>
            <EmptyState title={t('diagnosticLogs.empty')} />
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.id} data-log-level={row.level} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.time)}>{timeOf(row.ts)}</span>
              <span {...stylex.props(styles.tag, tone(row))}>{t(tagKey(row))}</span>
              <span {...stylex.props(styles.body)}>
                <span {...stylex.props(styles.code)}>{row.code}</span>
                {Object.keys(row.fields).length === 0 ? null : (
                  <span {...stylex.props(styles.fields)}>{formatDiagnosticFields(row.fields)}</span>
                )}
              </span>
            </li>
          ))
        )}
      </ul>
    </PanelDialog>
  );
}
