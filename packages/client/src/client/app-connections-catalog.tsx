import * as stylex from '@stylexjs/stylex';
import { useId, useRef, useState, type ReactElement } from 'react';

import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { ConnectorLogo, type FetchLogos } from './features/connectors/logos.js';
import { composioKeyProblem, pastedMcpUrl } from './features/connectors/mcp-url.js';

import type { BridgeActions } from './actions.js';
import { BridgeCallError, errorMessage } from './bridge.js';
import { Button } from './ds/button.js';
import { Callout } from './ds/callout.js';
import { CatalogCard, CatalogGrid } from './ds/catalog-grid.js';
import { FieldStack, SearchField, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SegmentedControl } from './ds/segmented.js';
import { SettingsRow } from './ds/settings-row.js';
import type { ConnectorApp, ConnectorsView } from './features/connectors/bridge.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  more: { alignSelf: 'center' },
  actions: { display: 'flex', gap: space.x2, justifyContent: 'flex-end' },
});

type Entry = ConnectorsView['catalog'][number];

const LOCALIZED = new Set([
  'gmail',
  'googlecalendar',
  'googledrive',
  'googledocs',
  'googlesheets',
  'outlook',
  'notion',
  'slack',
  'github',
  'linear',
  'jira',
  'asana',
  'trello',
  'airtable',
  'dropbox',
  'figma',
  'hubspot',
  'discord',
  'twitter',
  'reddit',
] as const);

type Localized = typeof LOCALIZED extends Set<infer T> ? T : never;

export function appSummary(entry: Entry, t: BotHarnessTranslate): string {
  return LOCALIZED.has(entry.service as Localized)
    ? t(`connectors.app.${entry.service as Localized}`)
    : entry.summary;
}

export function matchesApp(entry: Entry, query: string, t: BotHarnessTranslate): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [
    entry.service,
    entry.name,
    entry.summary,
    appSummary(entry, t),
    ...(entry.keywords ?? []),
  ].some((part) => part.toLowerCase().includes(needle));
}

export interface PickedApp {
  service: string;
  name: string;
  url?: string | undefined;
}

type Source = 'apps' | 'mcp';

interface Listed {
  service: string;
  name: string;
  summary: string;
  featured: boolean;
  url?: string | undefined;
}

interface Found {
  source: Source;
  query: string;
  apps: Listed[];
  next?: string | undefined;
}

type Search = NonNullable<BridgeActions['connectorSearch']>;
type McpSearch = NonNullable<BridgeActions['connectorMcpSearch']>;

const SEARCH_DELAY_MS = 300;

function localApps(view: ConnectorsView, query: string, t: BotHarnessTranslate): ConnectorApp[] {
  return view.catalog
    .filter((entry) => matchesApp(entry, query, t))
    .map((entry) => ({ ...entry, featured: true }));
}

export interface ComposioKeyActions {
  set(apiKey: string): Promise<ConnectorsView>;
  clear(): Promise<ConnectorsView>;
}

export const COMPOSIO_DASHBOARD = 'https://dashboard.composio.dev';

function ComposioKey({
  view,
  t,
  keys,
  onView,
}: {
  view: ConnectorsView;
  t: BotHarnessTranslate;
  keys: ComposioKeyActions;
  onView: (view: ConnectorsView) => void;
}): ReactElement {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const run = async (action: () => Promise<ConnectorsView>) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      onView(await action());
      setDraft('');
      setConfirming(false);
    } catch (failure) {
      setError(t('connectors.error', { message: errorMessage(failure) }));
    } finally {
      setBusy(false);
    }
  };
  if (view.configured)
    return (
      <div {...stylex.props(styles.stack)}>
        <SettingsRow
          title={t('connectors.composio.savedTitle')}
          description={t('connectors.composio.savedBody')}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={busy || confirming}
              onClick={() => setConfirming(true)}
            >
              {t('connectors.key.remove')}
            </Button>
          }
        />
        {confirming ? (
          <Callout tone="warning" role="status" title={t('connectors.key.removeTitle')}>
            <div {...stylex.props(styles.stack)}>
              <span>{t('connectors.key.removeBody')}</span>
              {error === undefined ? null : <Note tone="danger">{error}</Note>}
              <div {...stylex.props(styles.actions)}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  data-composio-key-clear=""
                  onClick={() => void run(() => keys.clear())}
                >
                  {t('connectors.key.remove')}
                </Button>
              </div>
            </div>
          </Callout>
        ) : null}
      </div>
    );
  const problem = composioKeyProblem(draft);
  return (
    <Callout tone="muted" title={t('connectors.composio.title')} data={{ 'data-composio-key': '' }}>
      <div {...stylex.props(styles.stack)}>
        <span>{t('connectors.composio.body')}</span>
        <span>
          {t('connectors.composio.steps')}{' '}
          <a href={COMPOSIO_DASHBOARD} target="_blank" rel="noopener noreferrer">
            {t('connectors.composio.open')}
          </a>
        </span>
        <TextField
          label={t('connectors.composio.field')}
          hint={t('connectors.composio.hint')}
          placeholder="ak_…"
          type="password"
          autoComplete="off"
          monospace
          value={draft}
          error={problem === undefined ? error : t(problem)}
          onChange={setDraft}
        />
        <div {...stylex.props(styles.actions)}>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || draft.trim() === '' || problem !== undefined}
            data-composio-key-save=""
            onClick={() => void run(() => keys.set(draft.trim()))}
          >
            {t('connectors.key.save')}
          </Button>
        </div>
      </div>
    </Callout>
  );
}

function composioKeys(
  actions: Pick<BridgeActions, 'connectorKeySet' | 'connectorKeyClear'>,
): ComposioKeyActions | undefined {
  const set = actions.connectorKeySet;
  const clear = actions.connectorKeyClear;
  return set === undefined || clear === undefined ? undefined : { set, clear };
}

export function AppCatalog({
  view,
  t,
  search,
  mcpSearch,
  logos,
  keys,
  onView,
  disabled,
  onPick,
}: {
  view: ConnectorsView;
  t: BotHarnessTranslate;
  search?: Search | undefined;
  mcpSearch?: McpSearch | undefined;
  logos?: FetchLogos | undefined;
  keys?: ComposioKeyActions | undefined;
  onView?: ((view: ConnectorsView) => void) | undefined;
  disabled?: boolean;
  onPick: (app: PickedApp) => void;
}): ReactElement {
  const id = useId();
  const [source, setSource] = useState<Source>(mcpSearch === undefined ? 'apps' : 'mcp');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found | undefined>();
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(0);

  const fetchPage = (from: Source, text: string, cursor?: string) => {
    if (from === 'mcp') return mcpSearch === undefined ? undefined : mcpSearch(text, cursor);
    return search === undefined || !view.configured ? undefined : search(text, cursor);
  };

  const run = (from: Source, text: string) => {
    const ticket = ++latest.current;
    setFailed(false);
    const page =
      from === 'mcp' && pastedMcpUrl(text) !== undefined ? undefined : fetchPage(from, text.trim());
    if (page === undefined) return;
    page.then(
      (result) => {
        if (ticket !== latest.current) return;
        setFailed(result.offline === true);
        setFound({ source: from, query: text, apps: result.apps, next: result.next });
      },
      () => {
        if (ticket === latest.current) setFailed(true);
      },
    );
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    run(source, '');
    return () => {
      latest.current += 1;
      if (timer.current !== undefined) clearTimeout(timer.current);
    };
  }, [search, mcpSearch, view.configured]);

  const change = (text: string) => {
    setQuery(text);
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(source, text), SEARCH_DELAY_MS);
  };

  const switchSource = (next: Source) => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    setSource(next);
    run(next, query);
  };

  const loadMore = () => {
    if (found?.next === undefined || more) return;
    const current = found;
    const page = fetchPage(current.source, current.query.trim(), current.next);
    if (page === undefined) return;
    const ticket = latest.current;
    setMore(true);
    page
      .then(
        (result) => {
          if (ticket !== latest.current) return;
          const seen = new Set(current.apps.map((app) => app.service));
          setFound({
            ...current,
            apps: [...current.apps, ...result.apps.filter((app) => !seen.has(app.service))],
            next: result.next,
          });
        },
        () => {
          if (ticket === latest.current) setFailed(true);
        },
      )
      .finally(() => setMore(false));
  };

  const pasted = source === 'mcp' ? pastedMcpUrl(query) : undefined;
  const current =
    found !== undefined && found.query === query && found.source === source ? found : undefined;
  const shown: Listed[] =
    pasted !== undefined
      ? [
          {
            service: `mcp_url_${pasted.host}`,
            name: pasted.host,
            summary: pasted.href,
            featured: false,
            url: pasted.href,
          },
        ]
      : (current?.apps ?? (source === 'apps' ? localApps(view, query, t) : []));
  const summary = (app: Listed) =>
    app.featured && source === 'apps'
      ? appSummary({ service: app.service, name: app.name, summary: app.summary }, t)
      : app.summary;
  const locked = source === 'apps' && !view.configured;
  return (
    <div ref={mount} {...stylex.props(styles.stack)}>
      {mcpSearch === undefined ? null : (
        <SegmentedControl<Source>
          id={`${id}-source`}
          label={t('connectors.catalog.source')}
          value={source}
          options={[
            { value: 'mcp', label: t('connectors.catalog.sourceMcp') },
            { value: 'apps', label: t('connectors.catalog.sourceApps') },
          ]}
          onChange={switchSource}
        />
      )}
      {source !== 'apps' ? null : keys !== undefined && onView !== undefined ? (
        <ComposioKey view={view} t={t} keys={keys} onView={onView} />
      ) : locked ? (
        <Note inset>{t('connectors.accounts.empty')}</Note>
      ) : null}
      <SearchField
        label={
          source === 'mcp' ? t('connectors.catalog.searchMcp') : t('connectors.catalog.search')
        }
        value={query}
        onChange={change}
      />
      {source === 'mcp' ? <Note inset>{t('connectors.catalog.mcpAbout')}</Note> : null}
      {failed ? (
        <Note inset>
          {source === 'mcp' ? t('connectors.catalog.mcpOffline') : t('connectors.catalog.offline')}
        </Note>
      ) : null}
      {shown.length === 0 ? (
        current === undefined && source === 'mcp' && !failed ? (
          <LoadingSkeleton kind="sidebar" label={t('connectors.catalog.searchMcp')} />
        ) : source === 'mcp' && pasted === undefined ? (
          <Note inset>
            {t('connectors.catalog.mcpEmpty')}{' '}
            <Button variant="ghost" size="sm" onClick={() => switchSource('apps')}>
              {t('connectors.catalog.tryApps')}
            </Button>
          </Note>
        ) : (
          <Note inset>{t('connectors.catalog.empty')}</Note>
        )
      ) : (
        <CatalogGrid label={t('connectors.connect.pick')} data={{ 'data-app-catalog': source }}>
          {shown.map((app) => {
            const count = view.accounts.filter(
              (account) => account.service === app.service && account.status === 'active',
            ).length;
            return (
              <CatalogCard
                key={app.service}
                title={app.name}
                summary={summary(app) || undefined}
                meta={
                  count > 0
                    ? t('connectors.catalog.connected', { count })
                    : t('connectors.catalog.available')
                }
                leading={<ConnectorLogo service={app.service} size={40} logos={logos} />}
                actionLabel={t('connectors.catalog.connect')}
                disabled={disabled === true || locked}
                data={{ 'data-connector-service': app.service }}
                onClick={() =>
                  onPick(
                    pasted !== undefined
                      ? { service: app.service, name: app.name, url: app.url }
                      : { service: app.service, name: app.name },
                  )
                }
              />
            );
          })}
        </CatalogGrid>
      )}
      {current?.next === undefined || pasted !== undefined ? null : (
        <Button variant="outline" size="sm" disabled={more} onClick={loadMore} xstyle={styles.more}>
          {t('connectors.catalog.more')}
        </Button>
      )}
    </div>
  );
}

export type ConnectLinked = (accountId: string, url: string | undefined) => void;

export function ConnectAppDialog({
  actions,
  view,
  t,
  service: initial,
  onClose,
  onLinked,
  onView,
}: {
  actions: Pick<
    BridgeActions,
    | 'connectorConnect'
    | 'connectorSearch'
    | 'connectorLogos'
    | 'connectorMcpSearch'
    | 'connectorMcpAdd'
    | 'connectorKeySet'
    | 'connectorKeyClear'
  >;
  view: ConnectorsView;
  t: BotHarnessTranslate;
  service?: PickedApp | undefined;
  onClose: () => void;
  onLinked: ConnectLinked;
  onView?: ((view: ConnectorsView) => void) | undefined;
}): ReactElement {
  const [picked, setPicked] = useState(initial);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const labels = { close: t('common.close'), cancel: t('common.cancel') };

  if (picked === undefined)
    return (
      <FormDialog
        title={t('connectors.connect.pick')}
        size="wide"
        labels={labels}
        submitLabel={t('connectors.connect.submit')}
        scroll
        showCancel
        onCancel={onClose}
      >
        <AppCatalog
          view={view}
          t={t}
          search={actions.connectorSearch}
          mcpSearch={actions.connectorMcpSearch}
          logos={actions.connectorLogos}
          keys={composioKeys(actions)}
          onView={onView}
          onPick={setPicked}
        />
      </FormDialog>
    );

  const submit = async () => {
    if (busy) return;
    const trimmed = label.trim();
    const named = trimmed === '' ? undefined : trimmed;
    const start =
      picked.url !== undefined
        ? actions.connectorMcpAdd === undefined
          ? undefined
          : () =>
              actions.connectorMcpAdd!({
                url: picked.url!,
                ...(named === undefined ? {} : { label: named }),
              })
        : actions.connectorConnect === undefined
          ? undefined
          : () => actions.connectorConnect!(picked.service, named);
    if (start === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const linked = await start();
      if (linked.url !== undefined) window.open(linked.url, '_blank', 'noopener,noreferrer');
      onLinked(linked.account.accountId, linked.url);
    } catch (failure) {
      setError(t('connectors.error', { message: errorMessage(failure) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      title={t('connectors.connect.title')}
      labels={labels}
      submitLabel={t('connectors.connect.submit')}
      busy={busy}
      error={error}
      onCancel={onClose}
      onSubmit={() => void submit()}
      secondary={
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPicked(undefined)}>
          {t('connectors.connect.change')}
        </Button>
      }
    >
      <FieldStack>
        <SettingsRow
          title={picked.name}
          description={picked.url}
          icon={<ConnectorLogo service={picked.service} size={28} logos={actions.connectorLogos} />}
        />
        <TextField
          label={t('connectors.connect.label')}
          hint={t('connectors.connect.labelHint')}
          placeholder={picked.name}
          initialFocus
          value={label}
          onChange={setLabel}
        />
      </FieldStack>
    </FormDialog>
  );
}

export function MarketAppConnections({
  actions,
  t,
}: {
  actions: Pick<
    BridgeActions,
    | 'connectors'
    | 'connectorConnect'
    | 'connectorSearch'
    | 'connectorLogos'
    | 'connectorMcpSearch'
    | 'connectorMcpAdd'
    | 'connectorKeySet'
    | 'connectorKeyClear'
  >;
  t: BotHarnessTranslate;
}): ReactElement {
  const [view, setView] = useState<ConnectorsView | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [denied, setDenied] = useState(false);
  const [service, setService] = useState<PickedApp | undefined>();
  const [signIn, setSignIn] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const load = () =>
    actions.connectors?.().then(setView, (failure: unknown) => {
      if (failure instanceof BridgeCallError && failure.code === 'permission-required')
        setDenied(true);
      else setError(errorMessage(failure));
    });
  const mount = useMountedResource<HTMLDivElement>(() => {
    void load();
  }, [actions]);

  return (
    <div ref={mount} data-market-app-connections="">
      <div {...stylex.props(styles.stack)}>
        <Note inset>{t('connectors.market.about')}</Note>
        {actions.connectors === undefined || denied ? (
          <Note inset>{t('connectors.bot.ownerOnly')}</Note>
        ) : error !== undefined ? (
          <Note tone="danger">{t('connectors.error', { message: error })}</Note>
        ) : view === undefined ? (
          <LoadingSkeleton kind="sidebar" label={t('botSettings.section.connectors')} />
        ) : (
          <AppCatalog
            view={view}
            t={t}
            search={actions.connectorSearch}
            mcpSearch={actions.connectorMcpSearch}
            logos={actions.connectorLogos}
            keys={composioKeys(actions)}
            onView={setView}
            onPick={setService}
          />
        )}
        {done ? <Note>{t('connectors.connect.connected')}</Note> : null}
        {signIn === undefined ? null : (
          <Note>
            {t('connectors.market.opened')}{' '}
            <a href={signIn} target="_blank" rel="noopener noreferrer">
              {t('connectors.accounts.signIn')}
            </a>
          </Note>
        )}
      </div>
      {view === undefined || service === undefined ? null : (
        <ConnectAppDialog
          actions={actions}
          view={view}
          t={t}
          service={service}
          onClose={() => setService(undefined)}
          onView={setView}
          onLinked={(_accountId, url) => {
            setService(undefined);
            setSignIn(url);
            setDone(url === undefined);
            void load();
          }}
        />
      )}
    </div>
  );
}
