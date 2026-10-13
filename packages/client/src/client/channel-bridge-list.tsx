import { externalPlatformLabel } from './bridge-source-label.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Button, Input, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  ChannelBridgeInput,
  ChannelBridgeRow,
  ChannelBridgeSnapshot,
} from '../../../core/src/messaging/channel-bridge.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { Modal } from './modal.js';
import { Combobox } from './combobox.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

function stateKey(row: ChannelBridgeRow) {
  return !row.enabled
    ? 'bridge.state.off'
    : row.availability !== 'available'
      ? 'bridge.state.unavailable'
      : row.reception === 'receiving'
        ? 'bridge.state.receiving'
        : row.reception === 'connecting'
          ? 'bridge.state.connecting'
          : 'bridge.state.unavailable';
}

export function bridgeNeedsAttention(row: ChannelBridgeRow): boolean {
  return row.enabled && stateKey(row) === 'bridge.state.unavailable';
}

export function ChannelBridgeAttention({
  channelId,
  actions,
  report,
}: {
  channelId: string;
  actions: Pick<BridgeActions, 'channelBridges'>;
  report(needsAttention: boolean): void;
}): null {
  const reportRef = useRef(report);
  reportRef.current = report;
  useEffect(() => {
    let current = true;
    let request = 0;
    const read = (): void => {
      const sequence = ++request;
      void Promise.resolve()
        .then(() => actions.channelBridges(channelId))
        .then(
          (snapshot) => {
            if (current && sequence === request)
              reportRef.current(snapshot.bridges.some(bridgeNeedsAttention));
          },
          () => undefined,
        );
    };
    read();
    const unsubscribe = subscribeMessagingDefaults(read);
    return () => {
      current = false;
      unsubscribe();
    };
  }, [actions, channelId]);
  return null;
}

function conditionKey(row: ChannelBridgeRow) {
  return row.platform === 'weixin'
    ? 'bridge.ownerDM'
    : row.collection === 'all'
      ? 'bridge.all'
      : 'bridge.mentions';
}

export function ChannelBridgeList({
  channelId,
  channelName,
  botNames,
  actions,
  t,
  showEmpty = true,
  children,
}: {
  channelId: string;
  channelName: string;
  botNames: ReadonlyMap<string, string>;
  actions: Pick<BridgeActions, 'channelBridges' | 'channelBridge'>;
  t: BotHarnessTranslate;
  showEmpty?: boolean;
  children?: ReactNode;
}): ReactElement {
  const [snapshot, setSnapshot] = useState<ChannelBridgeSnapshot>();
  const [mode, setMode] = useState<'add' | 'edit' | 'delete'>();
  const [selected, setSelected] = useState<ChannelBridgeRow>();
  const [sourceId, setSourceId] = useState('');
  const [name, setName] = useState('');
  const [delivery, setDelivery] = useState<'channel' | 'inbox'>('channel');
  const [enabled, setEnabled] = useState(true);
  const [collection, setCollection] = useState<'mentions' | 'all' | 'inherit'>('inherit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const refreshRequest = useRef(0);
  const generation = useRef(0);
  const source = mode === 'add' ? snapshot?.sources.find((s) => s.grantId === sourceId) : selected;
  const privateSource = source?.platform === 'weixin';
  const alreadyConnected =
    mode === 'add' &&
    snapshot?.bridges.some(
      (row) => row.grantId === sourceId && (row.delivery ?? 'channel') === delivery,
    );
  const refresh = async () => {
    const sequence = ++refreshRequest.current;
    const version = generation.current;
    const next = await actions.channelBridges(channelId);
    if (mounted.current && version === generation.current && sequence === refreshRequest.current)
      setSnapshot(next);
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    ++generation.current;
    setSnapshot(undefined);
    void refresh().catch(() => {
      if (mounted.current) setError(t('bridge.failed'));
    });
    const unsubscribeDefaults = subscribeMessagingDefaults(
      () => void refresh().catch(() => undefined),
    );
    return () => {
      unsubscribeDefaults();
      mounted.current = false;
      ++generation.current;
    };
  }, [channelId, actions]);
  const operate = async (operation: () => Promise<void>, close = false) => {
    if (busy) return;
    const version = generation.current;
    setBusy(true);
    setError('');
    try {
      await operation();
      await refresh();
      if (close && mounted.current && version === generation.current) setMode(undefined);
    } catch (err) {
      await refresh().catch(() => undefined);
      const code = err instanceof Error && 'code' in err ? err.code : '';
      if (mounted.current && version === generation.current)
        setError(
          t(
            code === 'bridge-stale'
              ? 'bridge.stale'
              : code === 'ordinary-delivery-unverified'
                ? 'bridge.unverified'
                : 'bridge.failed',
          ),
        );
    } finally {
      if (mounted.current && version === generation.current) setBusy(false);
    }
  };
  const open = (next: typeof mode, row?: ChannelBridgeRow) => {
    setMode(next);
    setDelivery(row?.delivery ?? 'channel');
    setSelected(row);
    setName(row?.name ?? '');
    setSourceId('');
    setEnabled(row?.enabled ?? true);
    setCollection(
      row ? (row.collectionInheritance === 'inherit' ? 'inherit' : row.collection) : 'inherit',
    );
    setError('');
  };
  const update = (row: ChannelBridgeRow, preference: boolean): ChannelBridgeInput => ({
    kind: 'update',
    ...(row.routeId ? { routeId: row.routeId } : {}),
    ...(row.delivery ? { delivery: row.delivery } : {}),
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: preference,
    collection: row.collection,
    ...(row.collectionInheritance ? { collectionInheritance: row.collectionInheritance } : {}),
    ...(row.defaultRevision !== undefined ? { expectedDefaultRevision: row.defaultRevision } : {}),
  });
  const save = async () => {
    if (!source) return;
    const base = {
      grantId: source.grantId,
      expectedGrantRevision: source.grantRevision,
      ...(mode === 'add' || selected?.delivery ? { delivery } : {}),
      ...(selected?.routeId && mode !== 'add' ? { routeId: selected.routeId } : {}),
    };
    const input: ChannelBridgeInput =
      mode === 'delete' && selected
        ? { kind: 'delete', ...base, expectedRevision: selected.revision }
        : mode === 'edit' && selected
          ? {
              kind: 'update',
              ...base,
              expectedRevision: selected.revision,
              name,
              enabled,
              collection: privateSource
                ? 'all'
                : collection === 'inherit'
                  ? selected.collection
                  : collection,
              collectionInheritance: privateSource
                ? 'custom'
                : collection === 'inherit'
                  ? 'inherit'
                  : 'custom',
              ...(selected.defaultRevision !== undefined
                ? { expectedDefaultRevision: selected.defaultRevision }
                : {}),
            }
          : {
              kind: 'add',
              ...base,
              name,
              enabled,
              collection: privateSource
                ? 'all'
                : collection === 'inherit'
                  ? 'mentions'
                  : collection,
              collectionInheritance: privateSource
                ? 'custom'
                : collection === 'inherit'
                  ? 'inherit'
                  : 'custom',
              ...(source.defaultRevision !== undefined
                ? { expectedDefaultRevision: source.defaultRevision }
                : {}),
            };
    await actions.channelBridge(channelId, input);
  };
  const close = () => {
    if (!busy) setMode(undefined);
  };
  return (
    <div ref={mount} className="bh-channel-bridges" role="region" aria-label={t('bridge.title')}>
      {error && !mode ? (
        <p className="bh-error" role="alert">
          {error}
        </p>
      ) : null}
      <SidebarCardList label={t('bridge.title')}>
        {snapshot?.bridges.map((row) => (
          <SidebarCardRow
            key={row.routeId ?? row.grantId}
            icon="plug"
            title={row.name}
            chips={
              <>
                <Tag tone="neutral">{t(stateKey(row))}</Tag>
                {row.delivery === 'inbox' ? (
                  <Tag tone="neutral">{t('bridge.inboxOnly')}</Tag>
                ) : null}
              </>
            }
            meta={[
              externalPlatformLabel(row.platform, t),
              row.conversationName,
              t(conditionKey(row)),
              ...(botNames.size > 1 ? [botNames.get(row.botSlug) ?? row.botSlug] : []),
            ].join(' · ')}
            muted={!row.enabled}
            hint={t('bridge.editFor', { name: row.name })}
            dialog
            disabled={busy}
            onClick={() => open('edit', row)}
            trailing={
              <Switch
                checked={row.enabled}
                disabled={busy}
                label={t('bridge.enableFor', { name: row.name })}
                onChange={(checked) =>
                  void operate(() => actions.channelBridge(channelId, update(row, checked)))
                }
              />
            }
          />
        ))}
        {showEmpty && snapshot && !snapshot.bridges.length ? (
          <li className="bh-card-row bh-muted bh-card-note">{t('bridge.empty')}</li>
        ) : null}
        {children}
      </SidebarCardList>
      <Modal
        className="bh-sidebar-modal"
        open={mode !== undefined}
        onClose={close}
        title={t(
          mode === 'add' ? 'bridge.add' : mode === 'delete' ? 'bridge.delete' : 'bridge.edit',
        )}
        {...(mode === 'add' ? { description: t('bridge.summary') } : {})}
        closeLabel={t('common.close')}
        footer={
          <div className="bh-modal-footer">
            {mode === 'edit' && selected ? (
              <>
                <Button
                  variant="outline"
                  className="bh-im-danger-outline"
                  disabled={busy}
                  aria-label={t('bridge.deleteFor', { name: selected.name })}
                  onClick={() => setMode('delete')}
                >
                  {t('common.delete')}
                </Button>
                <span className="bh-modal-footer-gap" />
              </>
            ) : null}
            <Button variant="outline" disabled={busy} onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              className={mode === 'delete' ? 'bh-im-danger' : undefined}
              disabled={busy || !source || alreadyConnected || (mode !== 'delete' && !name.trim())}
              onClick={() => void operate(save, true)}
            >
              {t(
                busy
                  ? 'identity.pending'
                  : mode === 'delete'
                    ? 'bridge.confirmDelete'
                    : 'bridge.save',
              )}
            </Button>
          </div>
        }
      >
        <div className="bh-sidebar-modal-form">
          {error ? (
            <p role="alert" className="bh-error">
              {error}
            </p>
          ) : null}
          {mode === 'add' ? (
            <>
              <label className="bh-im-field">
                <span>{t('bridge.authorizedSource')}</span>
                <Combobox
                  label={t('bridge.authorizedSource')}
                  toggleLabel={t('bridge.authorizedSource')}
                  placeholder={t('im.select')}
                  emptyLabel={t('bridge.noSources')}
                  value={sourceId}
                  disabled={busy}
                  onSelect={(value) => {
                    setSourceId(value);
                    const chosen = snapshot?.sources.find((s) => s.grantId === value);
                    setName(chosen?.conversationName ?? '');
                  }}
                  options={(snapshot?.sources ?? []).map((s) => ({
                    value: s.grantId,
                    label: s.conversationName,
                    hint: s.accountName,
                    disabled: snapshot?.bridges.some(
                      (row) =>
                        row.grantId === s.grantId && (row.delivery ?? 'channel') === delivery,
                    ),
                  }))}
                />
              </label>
              {!snapshot?.sources.length ? <p>{t('bridge.noSources')}</p> : null}
              <p className="bh-muted">{t('bridge.addHint')}</p>
            </>
          ) : null}
          {source ? (
            <p className="bh-sidebar-modal-subject">
              {externalPlatformLabel(source.platform, t)} · {source.conversationName}
              <span className="bh-bridge-secondary">
                {t('bridge.receiver', { name: source.accountName })}
              </span>
            </p>
          ) : null}
          {mode === 'add' && snapshot?.canTargetInbox ? (
            <label className="bh-im-field">
              <span>{t('bridge.destination')}</span>
              <Combobox
                searchable={false}
                label={t('bridge.destination')}
                toggleLabel={t('bridge.destination')}
                value={delivery}
                disabled={busy}
                onSelect={(value) => setDelivery(value === 'inbox' ? 'inbox' : 'channel')}
                options={[
                  { value: 'channel', label: t('bridge.dmTarget', { name: channelName }) },
                  { value: 'inbox', label: t('bridge.inboxOnly') },
                ]}
              />
            </label>
          ) : (
            <p>
              {delivery === 'inbox'
                ? t('bridge.inboxOnly')
                : t('bridge.target', { name: channelName })}
            </p>
          )}
          {delivery === 'inbox' ? <p className="bh-muted">{t('bridge.inboxOnlyHint')}</p> : null}
          {mode === 'delete' ? (
            <>
              <p>{t('bridge.deleteImpact')}</p>
              <p className="bh-muted">{t('bridge.retainHint')}</p>
            </>
          ) : mode === undefined ? null : (
            <>
              <label className="bh-im-field">
                <span>{t('bridge.name')}</span>
                <Input
                  value={name}
                  disabled={busy}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="bh-im-field">
                <span>{t('bridge.condition')}</span>
                {privateSource ? (
                  <p>{t('bridge.ownerDM')}</p>
                ) : (
                  <Combobox
                    searchable={false}
                    label={t('bridge.condition')}
                    toggleLabel={t('bridge.condition')}
                    value={collection}
                    disabled={busy}
                    onSelect={(value) =>
                      setCollection(
                        value === 'inherit' ? 'inherit' : value === 'all' ? 'all' : 'mentions',
                      )
                    }
                    options={[
                      { value: 'inherit', label: t('defaults.inherited') },
                      { value: 'mentions', label: t('bridge.mentions') },
                      {
                        value: 'all',
                        label: t('bridge.all'),
                        disabled: source?.ordinaryDelivery !== 'verified',
                      },
                    ]}
                  />
                )}
              </div>
              {privateSource ? <p className="bh-muted">{t('bridge.wechatDMHint')}</p> : null}
              {!privateSource && source?.ordinaryDelivery !== 'verified' ? (
                <p className="bh-muted">{t('bridge.unverified')}</p>
              ) : null}
              <div className="bh-switch-row">
                <span>{t('bridge.enableDraft')}</span>
                <Switch
                  checked={enabled}
                  disabled={busy}
                  label={t('bridge.enableDraft')}
                  onChange={setEnabled}
                />
              </div>
              {!privateSource ? <p className="bh-muted">{t('bridge.providerHint')}</p> : null}
              <p className="bh-muted">{t('bridge.wakeHint')}</p>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
