import { useState, type ReactElement } from 'react';

import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';

import type { BridgeActions } from './actions.js';
import { errorMessage } from './bridge.js';
import { BrandLogo } from './ds/brand-logo.js';
import { connectorLogo } from './ds/brand-logos.js';
import { Button } from './ds/button.js';
import { CatalogCard, CatalogGrid } from './ds/catalog-grid.js';
import { FieldStack, SearchField, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import type { ConnectorsView } from './features/connectors/bridge.js';
import type { BotHarnessTranslate } from './locale.js';

type Entry = ConnectorsView['catalog'][number];

export function matchesApp(entry: Entry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [entry.service, entry.name, entry.summary, ...(entry.keywords ?? [])].some((part) =>
    part.toLowerCase().includes(needle),
  );
}

export function AppCatalog({
  view,
  t,
  disabled,
  onPick,
}: {
  view: ConnectorsView;
  t: BotHarnessTranslate;
  disabled?: boolean;
  onPick: (service: string) => void;
}): ReactElement {
  const [query, setQuery] = useState('');
  const shown = view.catalog.filter((entry) => matchesApp(entry, query));
  return (
    <FieldStack>
      <SearchField label={t('connectors.catalog.search')} value={query} onChange={setQuery} />
      {shown.length === 0 ? (
        <Note inset>{t('connectors.catalog.empty')}</Note>
      ) : (
        <CatalogGrid label={t('connectors.connect.pick')} data={{ 'data-app-catalog': '' }}>
          {shown.map((entry) => {
            const count = view.accounts.filter(
              (account) => account.service === entry.service && account.status === 'active',
            ).length;
            return (
              <CatalogCard
                key={entry.service}
                title={entry.name}
                summary={entry.summary}
                meta={
                  count > 0
                    ? t('connectors.catalog.connected', { count })
                    : t('connectors.catalog.available')
                }
                leading={<BrandLogo src={connectorLogo(entry.service)} size={36} />}
                disabled={disabled === true}
                data={{ 'data-connector-service': entry.service }}
                onClick={() => onPick(entry.service)}
              />
            );
          })}
        </CatalogGrid>
      )}
    </FieldStack>
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
  actions: Pick<BridgeActions, 'connectorConnect'>;
  view: ConnectorsView;
  t: BotHarnessTranslate;
  service?: string | undefined;
  onClose: () => void;
  onLinked: (accountId: string, url: string) => void;
}): ReactElement {
  const [service, setService] = useState(initial);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const labels = { close: t('common.close'), cancel: t('common.cancel') };
  const name = (slug: string) => view.catalog.find((entry) => entry.service === slug)?.name ?? slug;

  if (service === undefined)
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
        <AppCatalog view={view} t={t} onPick={setService} />
      </FormDialog>
    );

  const submit = async () => {
    if (busy || actions.connectorConnect === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const trimmed = label.trim();
      const linked = await actions.connectorConnect(service, trimmed === '' ? undefined : trimmed);
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
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setService(undefined)}>
          {t('connectors.connect.change')}
        </Button>
      }
    >
      <FieldStack>
        <SettingsRow
          title={name(service)}
          icon={<BrandLogo src={connectorLogo(service)} size={28} />}
        />
        <TextField
          label={t('connectors.connect.label')}
          hint={t('connectors.connect.labelHint')}
          placeholder={name(service)}
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
  actions: Pick<BridgeActions, 'connectors' | 'connectorConnect'>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [view, setView] = useState<ConnectorsView | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [service, setService] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const load = () =>
    actions.connectors?.().then(setView, (failure: unknown) => setError(errorMessage(failure)));
  const mount = useMountedResource<HTMLDivElement>(() => {
    void load();
  }, [actions]);

  return (
    <div ref={mount} data-market-app-connections="">
      <FieldStack>
        <Note inset>{t('connectors.market.about')}</Note>
        {actions.connectors === undefined ? (
          <Note inset>{t('connectors.bot.ownerOnly')}</Note>
        ) : error !== undefined ? (
          <Note tone="danger">{t('connectors.error', { message: error })}</Note>
        ) : view === undefined ? (
          <LoadingSkeleton kind="sidebar" label={t('botSettings.section.connectors')} />
        ) : !view.configured ? (
          <Note inset>{t('connectors.accounts.empty')}</Note>
        ) : (
          <AppCatalog view={view} t={t} onPick={setService} />
        )}
        {notice === undefined ? null : <Note>{notice}</Note>}
      </FieldStack>
      {view === undefined || service === undefined ? null : (
        <ConnectAppDialog
          actions={actions}
          view={view}
          t={t}
          service={service}
          onClose={() => setService(undefined)}
          onLinked={() => {
            setService(undefined);
            setNotice(t('connectors.market.opened'));
            void load();
          }}
        />
      )}
    </div>
  );
}
