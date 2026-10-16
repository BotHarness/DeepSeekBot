import { MessagingHelp } from './messaging-help.js';
import { externalPlatformLabel } from './bridge-source-label.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  ChannelBridgeInput,
  ChannelBridgeRow,
  ChannelBridgeSnapshot,
} from '../../../core/src/messaging/channel-bridge.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { Combobox } from './combobox.js';
import { Field, TextField } from './ds/field.js';
import {
  ConfirmDialog,
  DangerTextButton,
  FormDialog,
  type DialogLabels,
} from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { color, space, text } from './ds/tokens.stylex.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

const styles = stylex.create({
  subject: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    minWidth: 0,
  },
  strong: { margin: 0, fontWeight: text.strong, overflowWrap: 'anywhere' },
  meta: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  text: { margin: 0 },
});

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
}): ReactElement {
  const reportRef = useRef(report);
  reportRef.current = report;
  const mount = useMountedResource<HTMLSpanElement>(() => {
    let current = true;
    let request = 0;
    const read = (): void => {
      const sequence = ++request;
      void Promise.resolve()
        .then(() => actions.channelBridges(channelId))
        .then((snapshot) => {
          if (current && sequence === request)
            reportRef.current(snapshot.bridges.some(bridgeNeedsAttention));
        })
        .catch(() => undefined);
    };
    read();
    const unsubscribe = subscribeMessagingDefaults(read);
    return () => {
      current = false;
      unsubscribe();
    };
  }, [actions, channelId]);
  return <span hidden ref={mount} />;
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
  const [dmMirror, setDmMirror] = useState(false);
  const [dmForward, setDmForward] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [collection, setCollection] = useState<'mentions' | 'all' | 'inherit'>('inherit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const refreshRequest = useRef(0);
  const generation = useRef(0);
  const source = mode === 'add' ? snapshot?.sources.find((s) => s.grantId === sourceId) : selected;
  const privateSource = source?.platform === 'weixin';
  const inboxHint = t(
    privateSource && dmMirror ? 'bridge.inboxMirrorHint' : 'bridge.inboxOnlyHint',
  );
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
    setDmMirror(row?.dmMirror === true);
    setDmForward(row?.dmForward === true);
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
              ...(privateSource ? { dmMirror, dmForward } : {}),
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
  const labels: DialogLabels = { close: t('common.close'), cancel: t('common.cancel') };
  const target =
    delivery === 'inbox' ? t('bridge.inboxOnly') : t('bridge.target', { name: channelName });
  const subject = source ? (
    <div {...stylex.props(styles.subject)}>
      <p {...stylex.props(styles.strong)}>
        {externalPlatformLabel(source.platform, t)} · {source.conversationName}
      </p>
      <p {...stylex.props(styles.meta)}>{t('bridge.receiver', { name: source.accountName })}</p>
    </div>
  ) : null;
  return (
    <div ref={mount} className="bh-channel-bridges" role="region" aria-label={t('bridge.title')}>
      {error && !mode ? <Note tone="danger">{error}</Note> : null}
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
      {mode === 'delete' && selected ? (
        <ConfirmDialog
          title={t('bridge.delete')}
          labels={labels}
          confirmLabel={t(busy ? 'identity.pending' : 'bridge.confirmDelete')}
          busy={busy}
          error={error || undefined}
          onCancel={close}
          onConfirm={() => void operate(save, true)}
        >
          {subject}
          <p {...stylex.props(styles.text)}>{target}</p>
          <p {...stylex.props(styles.text)}>{t('bridge.deleteImpact')}</p>
          <Note>{t('bridge.retainHint')}</Note>
        </ConfirmDialog>
      ) : mode === 'add' || (mode === 'edit' && selected) ? (
        <FormDialog
          title={t(mode === 'add' ? 'bridge.add' : 'bridge.edit')}
          description={mode === 'add' ? t('bridge.summary') : undefined}
          labels={labels}
          submitLabel={t(busy ? 'identity.pending' : 'bridge.save')}
          submitDisabled={!source || alreadyConnected || !name.trim()}
          busy={busy}
          error={error || undefined}
          onCancel={close}
          onSubmit={() => void operate(save, true)}
          secondary={
            mode === 'edit' && selected ? (
              <DangerTextButton
                label={t('bridge.deleteFor', { name: selected.name })}
                disabled={busy}
                onClick={() => setMode('delete')}
              >
                {t('common.delete')}
              </DangerTextButton>
            ) : undefined
          }
        >
          {mode === 'add' ? (
            <Field label={t('bridge.authorizedSource')} hint={t('bridge.addHint')} group>
              {() => (
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
                    setDmMirror(chosen?.dmMirror === true);
                    setDmForward(chosen?.dmForward === true);
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
              )}
            </Field>
          ) : null}
          {mode === 'add' && !snapshot?.sources.length ? (
            <Note>{t('bridge.noSources')}</Note>
          ) : null}
          {subject}
          {mode === 'add' && snapshot?.canTargetInbox ? (
            <Field
              label={t('bridge.destination')}
              hint={delivery === 'inbox' ? inboxHint : undefined}
              group
            >
              {() => (
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
              )}
            </Field>
          ) : (
            <>
              <p {...stylex.props(styles.text)}>{target}</p>
              {delivery === 'inbox' ? <Note>{inboxHint}</Note> : null}
            </>
          )}
          <TextField
            label={t('bridge.name')}
            value={name}
            disabled={busy}
            maxLength={120}
            onChange={setName}
          />
          <Field
            label={t('bridge.condition')}
            hint={
              privateSource
                ? t('bridge.wechatDMHint')
                : source?.ordinaryDelivery !== 'verified'
                  ? t('bridge.unverified')
                  : undefined
            }
            group
          >
            {() =>
              privateSource ? (
                <p {...stylex.props(styles.text)}>{t('bridge.ownerDM')}</p>
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
              )
            }
          </Field>
          <Field
            label={t('bridge.enableDraft')}
            hint={
              privateSource
                ? t('bridge.wakeHint')
                : `${t('bridge.providerHint')} ${t('bridge.wakeHint')}`
            }
            group
          >
            {() => (
              <Switch
                checked={enabled}
                disabled={busy}
                label={t('bridge.enableDraft')}
                onChange={setEnabled}
              />
            )}
          </Field>
          {privateSource && mode === 'edit' ? (
            <>
              <Field
                label={
                  <>
                    {t('bridge.dmMirror')}{' '}
                    <MessagingHelp
                      title={t('bridge.dmMirror')}
                      text={t('bridge.dmMirrorHint')}
                      t={t}
                    />
                  </>
                }
                group
              >
                {() => (
                  <Switch
                    checked={dmMirror}
                    disabled={busy}
                    label={t('bridge.dmMirror')}
                    onChange={setDmMirror}
                  />
                )}
              </Field>
              <Field
                label={
                  <>
                    {t('bridge.dmForward')}{' '}
                    <MessagingHelp
                      title={t('bridge.dmForward')}
                      text={t('bridge.dmForwardHint')}
                      t={t}
                    />
                  </>
                }
                hint={!selected?.dmForwardAvailable ? t('bridge.dmForwardUnavailable') : undefined}
                group
              >
                {() => (
                  <Switch
                    checked={dmForward}
                    disabled={busy || (!dmForward && !selected?.dmForwardAvailable)}
                    label={t('bridge.dmForward')}
                    onChange={setDmForward}
                  />
                )}
              </Field>
            </>
          ) : null}
        </FormDialog>
      ) : null}
    </div>
  );
}
