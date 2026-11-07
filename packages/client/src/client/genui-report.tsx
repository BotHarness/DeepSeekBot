import {
  Component,
  useSyncExternalStore,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  GENUI_LIMITS,
  type GenuiReport,
  type GenuiReply,
  type GenuiViewState,
} from '../../../core/src/channels/genui.js';
import type { BridgeActions } from './actions.js';
import { getGenuiPrivateView } from './genui-view.js';
import type { BotHarnessTranslate } from './locale.js';
import { ActionButton, ActionGroup } from './ds/action-button.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';

export type GenuiActions = Pick<BridgeActions, 'genuiView' | 'saveGenuiView' | 'sendGenuiReply'>;
const styles = stylex.create({
  report: { display: 'grid', gap: space.x3, minWidth: 0, color: color.fg },
  header: {
    margin: 0,
    fontSize: text.titleSize,
    fontWeight: text.strong,
    lineHeight: text.titleLine,
  },
  meta: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  metrics: { display: 'flex', flexWrap: 'wrap', gap: space.x5, margin: 0 },
  metric: { margin: 0, fontWeight: text.strong },
  scroll: { overflowX: 'auto', maxWidth: '100%' },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  cell: {
    padding: space.x2,
    textAlign: 'start',
    verticalAlign: 'top',
    borderBottomWidth: border.hairline,
    borderBottomStyle: 'solid',
    borderBottomColor: color.divider,
    overflowWrap: 'anywhere',
  },
  sort: {
    color: color.fg,
    backgroundColor: 'transparent',
    borderWidth: 0,
    cursor: 'pointer',
    font: 'inherit',
    textAlign: 'start',
  },
  chart: { display: 'grid', gap: space.x2, padding: 0, margin: 0, listStyle: 'none' },
  chartRow: { display: 'grid', gap: space.x1, overflowWrap: 'anywhere' },
  chartTrack: { display: 'block', position: 'relative', height: space.x3 },
  chartOrigin: {
    position: 'absolute',
    width: border.hairline,
    height: '100%',
    backgroundColor: color.divider,
  },
  bar: {
    position: 'absolute',
    height: space.x3,
    maxWidth: '100%',
    backgroundColor: color.accent,
    borderRadius: radius.xs,
  },
});

export function genuiChartBars(
  values: number[],
): Array<{ left: number; width: number; origin: number }> {
  const magnitude = Math.max(1, ...values.map((value) => Math.abs(value)));
  const scaled = values.map((value) => value / magnitude);
  const minimum = Math.min(0, ...scaled);
  const maximum = Math.max(0, ...scaled);
  const span = maximum - minimum || 1;
  const origin = minimum === 0 ? 0 : (-minimum / span) * 100;
  return scaled.map((value) => ({
    left: ((Math.min(0, value) - minimum) / span) * 100,
    width: (Math.abs(value) / span) * 100,
    origin,
  }));
}

export function genuiVisibleRows(report: GenuiReport, state: GenuiViewState): GenuiReport['rows'] {
  const filter = state.filter.trim().toLocaleLowerCase();
  const rows = report.rows.filter(
    (row) =>
      !filter ||
      report.columns.some((column) =>
        String(row.values[column.id]).toLocaleLowerCase().includes(filter),
      ),
  );
  const columnId = state.sortColumnId;
  if (columnId === null) return rows;
  return rows.sort((left, right) => {
    const first = left.values[columnId];
    const second = right.values[columnId];
    const comparison =
      typeof first === 'number' && typeof second === 'number'
        ? first - second
        : String(first).localeCompare(String(second));
    return state.sortDirection === 'asc' ? comparison : -comparison;
  });
}

function usePrivateView(
  report: GenuiReport,
  channelId: string,
  messageId: string,
  actions?: GenuiActions,
) {
  const [controller] = useState(() => getGenuiPrivateView(report, channelId, messageId, actions));
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return {
    ...snapshot,
    edit: controller.edit,
    save: controller.save,
    reload: controller.reload,
    keepDraft: controller.keepDraft,
    reset: controller.reset,
    session: controller,
  };
}

interface ReportProps {
  report: GenuiReport;
  channelId: string;
  messageId: string;
  actions?: GenuiActions;
  t: BotHarnessTranslate;
}

export function GenuiReportCard(props: ReportProps): ReactElement {
  return (
    <ReportRenderBoundary
      key={JSON.stringify([props.channelId, props.messageId, props.report.snapshotId])}
    >
      <SnapshotReportCard {...props} />
    </ReportRenderBoundary>
  );
}

class ReportRenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function SnapshotReportCard({
  report: incomingReport,
  channelId,
  messageId,
  actions,
  t,
}: ReportProps): ReactElement {
  const report = useRef(incomingReport).current;
  const view = usePrivateView(report, channelId, messageId, actions);
  const rows = useMemo(() => genuiVisibleRows(report, view.state), [report, view.state]);
  const sendStatus = view.sendStatus;
  const sending = sendStatus === 'sending';
  const interactive = actions !== undefined;
  const unavailable = !interactive || view.status === 'loading' || view.status === 'load-error';
  const selectedIds = report.rows
    .filter((row) => view.state.selectedIds.includes(row.id))
    .map((row) => row.id);
  const chartAvailable = report.elements.some((element) => element.kind === 'bar-chart');
  const submissionFor = (intent: GenuiReply['intent']) => {
    const reply: GenuiReply = { messageId, snapshotId: report.snapshotId, selectedIds, intent };
    const body = t(intent === 'continue' ? 'genui.continueBody' : 'genui.refreshBody', {
      title: report.title,
    });
    const payload = JSON.stringify({ channelId, body, reply });
    return { reply, body, payload };
  };
  const sent = (intent: GenuiReply['intent']) => {
    const previous = view.session.attempts[intent];
    return previous?.sent === true && previous.payload === submissionFor(intent).payload;
  };
  const send = async (intent: GenuiReply['intent']) => {
    if (!actions || view.session.getSnapshot().sendStatus === 'sending' || unavailable) return;
    if (intent === 'continue' && selectedIds.length === 0) return;
    const { reply, body, payload } = submissionFor(intent);
    const previous = view.session.attempts[intent];
    const submission =
      previous?.payload === payload
        ? previous
        : { payload, id: `human-${crypto.randomUUID()}`, sent: false };
    view.session.attempts[intent] = submission;
    if (submission.sent) return;
    view.session.setSendStatus('sending');
    try {
      await actions.sendGenuiReply(channelId, body, submission.id, reply);
      submission.sent = true;
      view.session.setSendStatus('sent');
    } catch {
      view.session.setSendStatus('error');
    }
  };
  const update = (next: Partial<GenuiViewState>) => view.edit({ ...view.state, ...next });
  const sort = (columnId: string) =>
    update({
      sortColumnId: columnId,
      sortDirection:
        view.state.sortColumnId === columnId && view.state.sortDirection === 'asc' ? 'desc' : 'asc',
    });
  const table = (columnIds: string[], key: string) => {
    const columns = columnIds.flatMap((columnId) =>
      report.columns.filter((column) => column.id === columnId),
    );
    return (
      <div key={key} {...stylex.props(styles.scroll)}>
        <table {...stylex.props(styles.table)}>
          <caption>{report.title}</caption>
          <thead>
            <tr>
              {interactive && (
                <th scope="col" {...stylex.props(styles.cell)}>
                  {t('genui.selected', { count: selectedIds.length })}
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    view.state.sortColumnId === column.id
                      ? view.state.sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  {...stylex.props(styles.cell)}
                >
                  <button
                    type="button"
                    disabled={unavailable}
                    onClick={() => sort(column.id)}
                    {...stylex.props(styles.sort)}
                  >
                    {column.label}
                  </button>
                </th>
              ))}
              <th scope="col" {...stylex.props(styles.cell)}>
                {t('genui.details')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {interactive && (
                  <td {...stylex.props(styles.cell)}>
                    <input
                      type="checkbox"
                      aria-label={t('genui.select', {
                        name: String(row.values[report.columns[0]?.id ?? ''] ?? row.id),
                      })}
                      checked={view.state.selectedIds.includes(row.id)}
                      disabled={
                        unavailable ||
                        (!view.state.selectedIds.includes(row.id) &&
                          selectedIds.length >= GENUI_LIMITS.selections)
                      }
                      onChange={(event) =>
                        update({
                          selectedIds: event.target.checked
                            ? [...view.state.selectedIds, row.id]
                            : view.state.selectedIds.filter((id) => id !== row.id),
                        })
                      }
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.id} {...stylex.props(styles.cell)}>
                    {row.values[column.id]}
                  </td>
                ))}
                <td {...stylex.props(styles.cell)}>
                  {row.details !== undefined && (
                    <>
                      <button
                        type="button"
                        aria-expanded={view.state.expandedId === row.id}
                        disabled={unavailable}
                        onClick={() =>
                          update({ expandedId: view.state.expandedId === row.id ? null : row.id })
                        }
                        {...stylex.props(styles.sort)}
                      >
                        {t('genui.details')}
                      </button>
                      {view.state.expandedId === row.id && <p>{row.details}</p>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  const statusKey =
    view.status === 'loading' || view.status === 'resolving'
      ? 'genui.loading'
      : view.status === 'saving'
        ? 'genui.saving'
        : view.status === 'load-error'
          ? 'genui.loadError'
          : view.status === 'save-error'
            ? 'genui.saveError'
            : view.status === 'conflict' || view.status === 'conflict-ready'
              ? 'genui.conflict'
              : 'genui.saved';

  return (
    <section aria-label={report.title} {...stylex.props(styles.report)}>
      <h3 {...stylex.props(styles.header)}>{report.title}</h3>
      <time dateTime={report.observedAt} {...stylex.props(styles.meta)}>
        {report.observedAt}
      </time>
      {report.predecessorMessageId && (
        <span {...stylex.props(styles.meta)}>{t('genui.predecessor')}</span>
      )}
      <dl {...stylex.props(styles.metrics)}>
        {report.elements.map((element, index) =>
          element.kind === 'metric' ? (
            <div key={index}>
              <dt>{element.label}</dt>
              <dd {...stylex.props(styles.metric)}>{element.value}</dd>
            </div>
          ) : null,
        )}
      </dl>
      {interactive &&
        (chartAvailable || report.elements.some((element) => element.kind === 'table')) && (
          <>
            <Input
              aria-label={t('genui.filter')}
              placeholder={t('genui.filter')}
              maxLength={120}
              value={view.state.filter}
              disabled={unavailable}
              onChange={(event) => update({ filter: event.target.value.slice(0, 120) })}
            />
            {chartAvailable && (
              <ActionGroup>
                <ActionButton
                  icon="info"
                  aria-pressed={view.state.view === 'table'}
                  disabled={unavailable}
                  onClick={() => update({ view: 'table' })}
                >
                  {t('genui.table')}
                </ActionButton>
                <ActionButton
                  icon="info"
                  aria-pressed={view.state.view === 'chart'}
                  disabled={unavailable}
                  onClick={() => update({ view: 'chart' })}
                >
                  {t('genui.chart')}
                </ActionButton>
              </ActionGroup>
            )}
          </>
        )}
      {view.state.view === 'chart' &&
        report.elements.map((element, index) => {
          if (element.kind !== 'bar-chart') return null;
          const bars = genuiChartBars(rows.map((row) => Number(row.values[element.valueColumnId])));
          return (
            <ul
              key={index}
              aria-label={
                report.columns.find((column) => column.id === element.valueColumnId)?.label
              }
              {...stylex.props(styles.chart)}
            >
              {rows.map((row, rowIndex) => (
                <li key={row.id} {...stylex.props(styles.chartRow)}>
                  <span>
                    {row.values[element.labelColumnId]}: {row.values[element.valueColumnId]}
                  </span>
                  <span aria-hidden="true" {...stylex.props(styles.chartTrack)}>
                    <span
                      {...stylex.props(styles.chartOrigin)}
                      style={{ left: `${bars[rowIndex]?.origin ?? 0}%` }}
                    />
                    <span
                      {...stylex.props(styles.bar)}
                      style={{
                        left: `${bars[rowIndex]?.left ?? 0}%`,
                        width: `${bars[rowIndex]?.width ?? 0}%`,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          );
        })}
      {report.elements.some((element) => element.kind === 'table')
        ? report.elements.map((element, index) =>
            element.kind === 'table' ? table(element.columnIds, `table-${index}`) : null,
          )
        : chartAvailable
          ? table(
              report.columns.map((column) => column.id),
              'equivalent-table',
            )
          : null}
      {rows.length === 0 &&
        (chartAvailable || report.elements.some((element) => element.kind === 'table')) && (
          <p>{t('genui.empty')}</p>
        )}
      {interactive && (
        <>
          <div role="status" {...stylex.props(styles.meta)}>
            {t(statusKey)}
          </div>
          <ActionGroup>
            <ActionButton icon="refresh" disabled={unavailable} onClick={view.reset}>
              {t('genui.reset')}
            </ActionButton>
            {(view.status === 'load-error' ||
              view.status === 'conflict' ||
              view.status === 'conflict-ready') && (
              <ActionButton icon="refresh" onClick={view.reload}>
                {t('genui.reload')}
              </ActionButton>
            )}
            {view.status === 'conflict' && (
              <ActionButton
                icon="check"
                onClick={() => {
                  void view.keepDraft();
                }}
              >
                {t('genui.keep')}
              </ActionButton>
            )}
            {(view.status === 'save-error' || view.status === 'conflict-ready') && (
              <ActionButton
                icon="check"
                onClick={() => {
                  void view.save();
                }}
              >
                {t('genui.save')}
              </ActionButton>
            )}
          </ActionGroup>
          <ActionGroup>
            <ActionButton
              icon="message-square"
              tone="primary"
              disabled={unavailable || selectedIds.length === 0 || sending || sent('continue')}
              busy={sendStatus === 'sending'}
              onClick={() => {
                void send('continue');
              }}
            >
              {t('genui.continue')}
            </ActionButton>
            <ActionButton
              icon="refresh"
              disabled={unavailable || sending || sent('refresh')}
              busy={sendStatus === 'sending'}
              onClick={() => {
                void send('refresh');
              }}
            >
              {t('genui.refresh')}
            </ActionButton>
          </ActionGroup>
          {sendStatus === 'error' && <p role="alert">{t('genui.sendError')}</p>}
          {sendStatus === 'sent' && <p role="status">{t('genui.sent')}</p>}
        </>
      )}
    </section>
  );
}
