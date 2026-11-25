import * as stylex from '@stylexjs/stylex';
import { useRef, useState, type ReactElement } from 'react';

import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { ConnectorLogo, type FetchLogos } from './features/connectors/logos.js';

import type { BridgeActions } from './actions.js';
import { BridgeCallError, errorMessage } from './bridge.js';
import { Button } from './ds/button.js';
import { CatalogCard, CatalogGrid } from './ds/catalog-grid.js';
import { FieldStack, SearchField, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import type { ConnectorApp, ConnectorsView } from './features/connectors/bridge.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  more: { alignSelf: 'center' },
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
}

interface Found {
  query: string;
  apps: ConnectorApp[];
  next?: string | undefined;
}

type Search = NonNullable<BridgeActions['connectorSearch']>;

const SEARCH_DELAY_MS = 300;

function localApps(view: ConnectorsView, query: string, t: BotHarnessTranslate): ConnectorApp[] {
  return view.catalog
    .filter((entry) => matchesApp(entry, query, t))
    .map((entry) => ({ ...entry, featured: true }));
}

export function AppCatalog({
  view,
  t,
  search,
  logos,
  disabled,
  onPick,
}: {
  view: ConnectorsView;
  t: BotHarnessTranslate;
  search?: Search | undefined;
  logos?: FetchLogos | undefined;
  disabled?: boolean;
  onPick: (app: PickedApp) => void;
}): ReactElement {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found | undefined>();
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(0);

  const run = (text: string) => {
    if (search === undefined || !view.configured) return;
    const ticket = ++latest.current;
    search(text.trim()).then(
      (result) => {
        if (ticket !== latest.current) return;
        setFailed(result.offline === true);
        setFound({ query: text, apps: result.apps, next: result.next });
      },
      () => {
        if (ticket === latest.current) setFailed(true);
      },
    );
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    run('');
    return () => {
      latest.current += 1;
      if (timer.current !== undefined) clearTimeout(timer.current);
    };
  }, [search, view.configured]);

  const change = (text: string) => {
    setQuery(text);
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(text), SEARCH_DELAY_MS);
  };

  const loadMore = () => {
    if (search === undefined || found?.next === undefined || more) return;
    const current = found;
    const ticket = latest.current;
    setMore(true);
    search(current.query.trim(), current.next)
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

  const current = found !== undefined && found.query === query ? found : undefined;
  const shown = current?.apps ?? localApps(view, query, t);
  const summary = (app: ConnectorApp) =>
    app.featured
      ? appSummary({ service: app.service, name: app.name, summary: app.summary }, t)
      : app.summary;
  return (
    <div ref={mount} {...stylex.props(styles.stack)}>
      <SearchField label={t('connectors.catalog.search')} value={query} onChange={change} />
      {failed ? <Note inset>{t('connectors.catalog.offline')}</Note> : null}
      {shown.length === 0 ? (
        <Note inset>{t('connectors.catalog.empty')}</Note>
      ) : (
        <CatalogGrid label={t('connectors.connect.pick')} data={{ 'data-app-catalog': '' }}>
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
                disabled={disabled === true}
                data={{ 'data-connector-service': app.service }}
                onClick={() => onPick({ service: app.service, name: app.name })}
              />
            );
          })}
        </CatalogGrid>
      )}
      {current?.next === undefined ? null : (
        <Button variant="outline" size="sm" disabled={more} onClick={loadMore} xstyle={styles.more}>
          {t('connectors.catalog.more')}
        </Button>
      )}
    </div>
  );
}

export function ConnectAppDialog({
  actions,
  view,
  t,
  service: initial,
  onClose,
  onLinked,
}: {
  actions: Pick<BridgeActions, 'connectorConnect' | 'connectorSearch' | 'connectorLogos'>;
  view: ConnectorsView;
  t: BotHarnessTranslate;
  service?: PickedApp | undefined;
  onClose: () => void;
  onLinked: (accountId: string, url: string) => void;
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
          logos={actions.connectorLogos}
          onPick={setPicked}
        />
      </FormDialog>
    );

  const submit = async () => {
    if (busy || actions.connectorConnect === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const trimmed = label.trim();
      const linked = await actions.connectorConnect(
        picked.service,
        trimmed === '' ? undefined : trimmed,
      );
      window.open(linked.url, '_blank', 'noopener,noreferrer');
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
    'connectors' | 'connectorConnect' | 'connectorSearch' | 'connectorLogos'
  >;
  t: BotHarnessTranslate;
}): ReactElement {
  const [view, setView] = useState<ConnectorsView | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [denied, setDenied] = useState(false);
  const [service, setService] = useState<PickedApp | undefined>();
  const [signIn, setSignIn] = useState<string | undefined>();
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
        ) : !view.configured ? (
          <Note inset>{t('connectors.accounts.empty')}</Note>
        ) : (
          <AppCatalog
            view={view}
            t={t}
            search={actions.connectorSearch}
            logos={actions.connectorLogos}
            onPick={setService}
          />
        )}
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
          onLinked={(_accountId, url) => {
            setService(undefined);
            setSignIn(url);
            void load();
          }}
        />
      )}
    </div>
  );
}
