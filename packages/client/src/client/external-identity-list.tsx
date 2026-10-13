import { CreateAppForm } from './create-app-form.js';
import type { ProviderAppSetup } from './provider-app-setup.js';
import { externalPlatformLabel } from './bridge-source-label.js';
import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  Button,
  Switch,
  Tag,
  Tooltip,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconRightUpOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { MessagingSnapshot } from '../../../core/src/messaging/outbound.js';
import type {
  MessagingIdentityInput,
  MessagingIdentityView,
} from '../../../core/src/messaging/identity.js';
import { Combobox } from './combobox.js';
import { ExternalConversations, type ConversationSync } from './external-conversations.js';
import type { MessagingConversationInput } from '../../../core/src/messaging/conversations.js';
import type { GroupReceptionInput } from '../../../core/src/messaging/group-policy.js';
import type { BotHarnessTranslate } from './locale.js';
import { Field, TextField } from './ds/field.js';
import {
  ConfirmDialog,
  DangerTextButton,
  FormDialog,
  type DialogLabels,
} from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { color, space, text } from './ds/tokens.stylex.js';
import { MessagingHelp } from './messaging-help.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { openExternalBindingSettings } from './bot-settings-open.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  block: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    minWidth: 0,
  },
  muted: { color: color.muted },
  strong: { fontWeight: text.strong },
  meta: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  text: { margin: 0 },
  list: { margin: 0, paddingInlineStart: space.x5 },
  subject: {
    margin: 0,
    fontWeight: text.strong,
    overflowWrap: 'anywhere',
  },
  heading: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
  },
  links: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: `${space.x3} ${space.x5}`,
  },
  link: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    color: color.accent,
    textUnderlineOffset: '3px',
  },
  picker: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x2,
  },
});

const AVAILABILITY = {
  available: 'identity.state.available',
  paused: 'identity.state.paused',
  unavailable: 'identity.state.unavailable',
  'rebind-required': 'identity.state.rebind-required',
} as const;

export function ExternalIdentityList({
  snapshot,
  t,
  mutate,
  conversation,
  rules,
  refresh,
  channels,
  sync,
  syncChannels,
  botName = (slug) => slug,
  bindDialog,
  appSetup,
  post,
}: {
  snapshot: MessagingSnapshot | undefined;
  post?(identity: MessagingIdentityView): void;
  t: BotHarnessTranslate;
  mutate(input: MessagingIdentityInput): Promise<void>;
  conversation(input: MessagingConversationInput): Promise<void>;
  rules(grantId: string, input: GroupReceptionInput): Promise<void>;
  refresh(): Promise<void>;
  channels?: { id: string; name: string }[];
  sync?: ConversationSync;
  syncChannels?: { id: string; name: string }[];
  botName?(slug: string): string;
  appSetup?: { client: ProviderAppSetup; botSlug: string } | undefined;
  bindDialog?: { onClose(): void; dismissLabel: string; description: string };
}): ReactElement {
  const [mode, setMode] = useState<'bind' | 'bound' | 'edit' | 'reconnect' | 'unbind' | undefined>(
    bindDialog ? 'bind' : undefined,
  );
  const [selected, setSelected] = useState<MessagingIdentityView>();
  const [creatingApp, setCreatingApp] = useState(false);
  const [accountKey, setAccountKey] = useState('');
  const [name, setName] = useState('');
  const [inheritEnabled, setInheritEnabled] = useState(false);
  const [typingEnabled, setTypingEnabled] = useState(true);
  const [inheritTyping, setInheritTyping] = useState(false);
  const [newConversations, setNewConversations] = useState<'auto' | 'ask' | 'inherit'>('inherit');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const refreshSequence = useRef(0);
  const settingsCleanup = useRef<(() => void) | undefined>(undefined);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    active.current = true;
    if (bindDialog) void refreshApps();
    return () => {
      active.current = false;
      refreshSequence.current++;
      settingsCleanup.current?.();
    };
  }, []);
  const refreshApps = async () => {
    const sequence = ++refreshSequence.current;
    const current = () => active.current && refreshSequence.current === sequence;
    setRefreshing(true);
    setError('');
    try {
      await refresh();
    } catch {
      if (current()) setError(t('identity.refreshFailed'));
    } finally {
      if (current()) setRefreshing(false);
    }
  };
  const identities = snapshot?.identities ?? [];
  const accounts = snapshot?.accounts ?? [];
  const selectedAccount = accounts.find((a) => a.providerId + ':' + a.ref === accountKey);
  const bound = identities.find(
    (i) => selectedAccount && i.providerId + ':' + i.accountRef === accountKey,
  );
  const platform = (value: string) => externalPlatformLabel(value, t);
  const conversations = (row: MessagingIdentityView) =>
    (snapshot?.grants ?? []).filter(
      (g) => g.bindingId === row.id && !g.revokedAt && g.receiveScope !== undefined,
    );
  const open = (next: typeof mode, row?: MessagingIdentityView) => {
    settingsCleanup.current?.();
    refreshSequence.current++;
    setRefreshing(false);
    setError('');
    setMode(next);
    setCreatingApp(false);
    setSelected(row);
    setName(row?.name ?? '');
    setInheritEnabled(row?.enabledInheritance === 'inherit');
    setTypingEnabled(row?.typingEnabled !== false);
    setInheritTyping(row?.typingInheritance === 'inherit');
    setNewConversations(
      row?.newConversationsInheritance === 'custom' ? row.newConversations : 'inherit',
    );
    setAccountKey('');
    if (next === 'bind') void refreshApps();
  };
  const close = () => {
    if (!busy) {
      refreshSequence.current++;
      setRefreshing(false);
      settingsCleanup.current?.();
      setMode(undefined);
      bindDialog?.onClose();
    }
  };
  const openAppSettings = () => {
    setMode(undefined);
    settingsCleanup.current?.();
    settingsCleanup.current = openExternalBindingSettings(
      document,
      () => {
        if (!active.current) return;
        setMode('bind');
        void refreshApps();
      },
      () => {
        if (!active.current) return;
        setMode('bind');
        setError(t('identity.settingsUnavailable'));
      },
    );
  };
  const labels: DialogLabels = {
    close: t('common.close'),
    cancel: bindDialog?.dismissLabel ?? t('common.cancel'),
  };
  const operate = async (operation: () => Promise<void>, done = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operation();
      if (done) setMode(undefined);
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : '';
      setError(
        t(
          code === 'identity-stale' || code === 'identity-changed' || code === 'conversation-stale'
            ? 'identity.stale'
            : code === 'defaults-stale'
              ? 'defaults.stale'
              : code === 'conversation-limit'
                ? 'conversation.limit'
                : 'identity.failed',
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (mode === 'bind' && selectedAccount) {
      await mutate({
        kind: 'bind',
        providerId: selectedAccount.providerId,
        accountRef: selectedAccount.ref,
        fingerprint: selectedAccount.fingerprint,
      });
      setMode('bound');
    } else if (selected && mode && mode !== 'bind' && mode !== 'bound') {
      await mutate(
        mode === 'edit'
          ? {
              kind: 'update',
              id: selected.id,
              expectedRevision: selected.revision,
              name,
              enabled: selected.enabled,
              inheritEnabled,
              newConversations,
              ...(selected.platform === 'weixin' ? { typingEnabled, inheritTyping } : {}),
              ...(selected.defaultRevision !== undefined
                ? { expectedDefaultRevision: selected.defaultRevision }
                : {}),
            }
          : { kind: mode, id: selected.id, expectedRevision: selected.revision },
      );
    }
  };
  return (
    <>
      <span hidden ref={mount} />
      {error && !mode ? <Note tone="danger">{error}</Note> : null}
      {bindDialog ? null : (
        <SidebarCardList label={t('identity.title')}>
          {[...identities]
            .sort(
              (a, b) =>
                platform(a.platform).localeCompare(platform(b.platform)) ||
                a.createdAt.localeCompare(b.createdAt),
            )
            .map((row) => (
              <SidebarCardRow
                key={row.id}
                icon="id-card"
                title={row.name}
                meta={`${platform(row.platform)} · ${t('identity.conversationCount', {
                  count: conversations(row).length,
                })}`}
                chips={
                  <>
                    <Tag tone="neutral">{t(AVAILABILITY[row.availability])}</Tag>
                    {row.platform === 'weixin' ? (
                      <span className="bh-bridge-secondary" role="status">
                        {t(
                          !row.typing?.supported
                            ? 'identity.typing.unavailable'
                            : !row.typingEnabled
                              ? 'identity.typing.off'
                              : row.typing.phase === 'cleanup-unconfirmed'
                                ? 'identity.typing.cleanup'
                                : row.typing.phase === 'unavailable'
                                  ? 'identity.typing.refused'
                                  : row.typing.phase === 'accepted'
                                    ? 'identity.typing.accepted'
                                    : row.typing.phase === 'requesting'
                                      ? 'identity.typing.requesting'
                                      : 'identity.typing.ready',
                        )}
                      </span>
                    ) : null}
                  </>
                }
                muted={!row.enabled}
                hint={t('identity.editFor', { name: row.name })}
                dialog
                disabled={busy}
                onClick={() => open('edit', row)}
                trailing={
                  <Switch
                    label={t('identity.enableFor', { name: row.name })}
                    checked={row.enabled}
                    disabled={busy}
                    onChange={(enabled) =>
                      void operate(() =>
                        mutate({
                          kind: 'update',
                          id: row.id,
                          expectedRevision: row.revision,
                          name: row.name,
                          enabled,
                        }),
                      )
                    }
                  />
                }
              />
            ))}
          <SidebarCardRow
            anchor="lark-bind"
            icon="plus"
            title={t('identity.bind')}
            meta={
              !snapshot ? t('im.loading') : identities.length ? undefined : t('identity.emptyShort')
            }
            muted
            dialog
            disabled={busy || !snapshot}
            onClick={() => open('bind')}
          />
        </SidebarCardList>
      )}
      {mode === 'bind' && creatingApp && appSetup ? (
        <CreateAppForm
          client={appSetup.client}
          botSlug={appSetup.botSlug}
          descriptors={snapshot?.appSetups ?? []}
          t={t}
          title={t('identity.bind')}
          description={bindDialog?.description || undefined}
          labels={labels}
          error={error || undefined}
          onCancel={close}
          onBack={() => setCreatingApp(false)}
          onCreated={async () => {
            const input = appSetup.client.binding(appSetup.botSlug);
            await mutate(input);
            await refresh();
            if (input.kind === 'bind') setAccountKey(input.providerId + ':' + input.accountRef);
            appSetup.client.forget(appSetup.botSlug);
            setCreatingApp(false);
            setMode('bound');
          }}
        />
      ) : mode === 'bind' ? (
        <FormDialog
          title={t('identity.bind')}
          description={bindDialog?.description || undefined}
          labels={labels}
          submitLabel={t(busy ? 'identity.pending' : 'identity.bind')}
          submitDisabled={
            refreshing ||
            !selectedAccount ||
            !selectedAccount.connected ||
            !!selectedAccount.boundBotSlug ||
            !!selectedAccount.unsupported
          }
          busy={busy}
          error={error || undefined}
          onCancel={close}
          onSubmit={() => void operate(save)}
        >
          <nav aria-label={t('identity.tutorials')} {...stylex.props(styles.block)}>
            <span {...stylex.props(styles.muted)}>{t('identity.tutorials')}</span>
            <div {...stylex.props(styles.links)}>
              {(['lark', 'slack', 'wechat', 'more'] as const).map((guide) => (
                <a
                  key={guide}
                  href={t(`identity.tutorial.${guide}Url`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...stylex.props(styles.link)}
                >
                  {t(`identity.tutorial.${guide}`)}
                  <IconRightUpOutlineRegular size={14} />
                </a>
              ))}
            </div>
          </nav>
          <Field
            label={t('identity.app')}
            hint={t(
              selectedAccount?.platform === 'qq' ? 'identity.bindHintQq' : 'identity.bindHint',
            )}
            group
          >
            {() => (
              <>
                <div {...stylex.props(styles.picker)}>
                  <Combobox
                    label={t('identity.app')}
                    toggleLabel={t('identity.app')}
                    placeholder={t(accounts.length ? 'im.select' : 'identity.noApps')}
                    emptyLabel={t('identity.noApps')}
                    disabled={busy}
                    value={accountKey}
                    onSelect={setAccountKey}
                    action={{
                      label: t('identity.manageApps'),
                      onSelect: openAppSettings,
                      disabled: busy || refreshing,
                    }}
                    options={accounts
                      .filter(
                        (account) =>
                          !identities.some(
                            (i) =>
                              i.providerId === account.providerId && i.accountRef === account.ref,
                          ),
                      )
                      .sort(
                        (a, b) =>
                          Number(a.boundBotSlug !== undefined || !a.connected || !!a.unsupported) -
                            Number(
                              b.boundBotSlug !== undefined || !b.connected || !!b.unsupported,
                            ) ||
                          platform(a.platform).localeCompare(platform(b.platform)) ||
                          a.name.localeCompare(b.name),
                      )
                      .map((account) => ({
                        value: account.providerId + ':' + account.ref,
                        label: account.name,
                        hint:
                          account.boundBotSlug !== undefined
                            ? t('identity.appUsedBy', {
                                platform: platform(account.platform),
                                name: botName(account.boundBotSlug),
                              })
                            : account.unsupported
                              ? t('identity.appUnsupported', {
                                  platform: platform(account.platform),
                                })
                              : account.connected
                                ? platform(account.platform)
                                : t('identity.appOffline', {
                                    platform: platform(account.platform),
                                  }),
                        disabled:
                          !account.connected ||
                          account.boundBotSlug !== undefined ||
                          !!account.unsupported,
                      }))}
                  />
                  <Tooltip label={t('identity.refreshApps')} portal side="bottom" delayMs={250}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<IconRefreshOutlineRegular size={16} />}
                      aria-label={t('identity.refreshApps')}
                      aria-busy={refreshing}
                      disabled={busy || refreshing}
                      onClick={() => void refreshApps()}
                    />
                  </Tooltip>
                </div>
                <div {...stylex.props(styles.actions)}>
                  {appSetup && snapshot?.appSetups?.length ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || refreshing}
                      onClick={() => setCreatingApp(true)}
                    >
                      {t('appSetup.create')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    icon={<IconPlusOutlineRegular size={16} />}
                    disabled={busy || refreshing}
                    onClick={openAppSettings}
                  >
                    {t('identity.manageApps')}
                  </Button>
                </div>
              </>
            )}
          </Field>
          {appSetup && !snapshot?.appSetups?.length ? <Note>{t('appSetup.fallback')}</Note> : null}
          {refreshing ? <Note>{t('identity.refreshing')}</Note> : null}
        </FormDialog>
      ) : mode === 'bound' ? (
        <FormDialog
          title={t('identity.bind')}
          labels={labels}
          submitLabel={t('identity.done')}
          showCancel={false}
          onCancel={close}
          onSubmit={close}
        >
          {selectedAccount ? (
            <>
              <p {...stylex.props(styles.subject)}>
                {platform(selectedAccount.platform)} · {selectedAccount.name}
              </p>
              <Note>
                {t(
                  bound?.reception === 'receiving'
                    ? selectedAccount.platform === 'weixin'
                      ? 'identity.readyWeixin'
                      : selectedAccount.platform === 'qq'
                        ? 'identity.readyQq'
                        : 'identity.ready'
                    : bound?.reception === 'connecting' || bound === undefined
                      ? 'identity.connecting'
                      : 'identity.offline',
                  { app: selectedAccount.name },
                )}
              </Note>
            </>
          ) : null}
        </FormDialog>
      ) : mode === 'edit' && selected ? (
        <FormDialog
          title={t('identity.editTitle')}
          size="small"
          scroll
          labels={labels}
          submitLabel={t(busy ? 'identity.pending' : 'identity.save')}
          submitDisabled={!name.trim()}
          busy={busy}
          error={error || undefined}
          onCancel={close}
          onSubmit={() => void operate(save, true)}
          secondary={
            <>
              {post ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !selected.enabled}
                  onClick={() => {
                    const identity = selected;
                    close();
                    post(identity);
                  }}
                >
                  {t('proactive.title')}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                aria-label={t('identity.reconnectFor', { name: selected.name })}
                onClick={() => setMode('reconnect')}
              >
                {t('identity.reconnect')}
              </Button>
              <DangerTextButton
                label={t('identity.unbindFor', { name: selected.name })}
                disabled={busy}
                onClick={() => setMode('unbind')}
              >
                {t('identity.unbind')}
              </DangerTextButton>
            </>
          }
        >
          <p {...stylex.props(styles.subject)}>
            {platform(selected.platform)} · {selected.name}
          </p>
          {selected.platform === 'feishu' ? (
            <div role="status" {...stylex.props(styles.block)}>
              <span {...stylex.props(styles.strong)}>{t('identity.feedback.title')}</span>
              <p {...stylex.props(styles.meta)}>
                {t(
                  accounts.some(
                    (account) =>
                      account.providerId === selected.providerId &&
                      account.ref === selected.accountRef &&
                      account.fingerprint === selected.fingerprint &&
                      account.reactionSupported === true,
                  )
                    ? 'identity.feedback.supported'
                    : 'identity.feedback.capabilityUnavailable',
                )}
              </p>
              {(snapshot?.feedback ?? [])
                .filter((item) => item.bindingId === selected.id)
                .slice(0, 5)
                .map((item) => (
                  <p
                    key={item.sourceEventId}
                    title={item.sourceEventId}
                    {...stylex.props(styles.meta)}
                  >
                    {item.sourceEventId.slice(-8)} · {t('identity.feedback.received')}:{' '}
                    {t(`identity.feedback.${item.attempts.received?.state ?? 'none'}`)} ·{' '}
                    {t('identity.feedback.answered')}:{' '}
                    {t(`identity.feedback.${item.attempts.answered?.state ?? 'none'}`)}
                  </p>
                ))}
            </div>
          ) : null}
          <TextField
            label={t('identity.displayName')}
            value={name}
            disabled={busy}
            maxLength={120}
            onChange={setName}
          />
          <Field
            label={
              <span {...stylex.props(styles.heading)}>
                {t('defaults.identity')}
                <MessagingHelp
                  title={t('defaults.identity')}
                  text={t('defaults.restoreHint')}
                  t={t}
                />
              </span>
            }
            group
          >
            {() => (
              <Combobox
                searchable={false}
                label={t('defaults.identityOrigin')}
                toggleLabel={t('defaults.identityOrigin')}
                value={inheritEnabled ? 'inherit' : 'custom'}
                disabled={busy}
                onSelect={(value) => setInheritEnabled(value === 'inherit')}
                options={[
                  { value: 'inherit', label: t('defaults.inherited') },
                  { value: 'custom', label: t('defaults.custom') },
                ]}
              />
            )}
          </Field>
          {selected.platform === 'weixin' ? (
            <Field label={t('identity.typing.label')} hint={t('identity.typing.hint')} group>
              {() => (
                <>
                  <Combobox
                    searchable={false}
                    label={t('defaults.typingOrigin')}
                    toggleLabel={t('defaults.typingOrigin')}
                    value={inheritTyping ? 'inherit' : 'custom'}
                    disabled={busy}
                    onSelect={(value) => setInheritTyping(value === 'inherit')}
                    options={[
                      { value: 'inherit', label: t('defaults.inherited') },
                      { value: 'custom', label: t('defaults.custom') },
                    ]}
                  />
                  {inheritTyping ? (
                    <Note>{t('defaults.typingInheritHint')}</Note>
                  ) : (
                    <Switch
                      label={t('identity.typing.label')}
                      checked={typingEnabled}
                      disabled={busy}
                      onChange={setTypingEnabled}
                    />
                  )}
                  {!selected.typing?.supported ? (
                    <Note>{t('identity.typing.unavailable')}</Note>
                  ) : null}
                </>
              )}
            </Field>
          ) : (
            <Field
              label={
                <span {...stylex.props(styles.heading)}>
                  {t('identity.newConversations')}
                  <MessagingHelp
                    title={t('identity.newConversations')}
                    text={t('identity.newConversationsHint')}
                    t={t}
                  />
                </span>
              }
              group
            >
              {() => (
                <Combobox
                  searchable={false}
                  label={t('identity.newConversations')}
                  toggleLabel={t('identity.newConversations')}
                  value={newConversations}
                  disabled={busy}
                  onSelect={(value) =>
                    setNewConversations(value === 'ask' || value === 'auto' ? value : 'inherit')
                  }
                  options={[
                    {
                      value: 'inherit',
                      label:
                        selected.newConversationsInheritance === 'custom'
                          ? t('identity.newConversations.inheritPlain')
                          : t('identity.newConversations.inherit', {
                              value: t(
                                selected.newConversations === 'ask'
                                  ? 'identity.newConversations.ask'
                                  : 'identity.newConversations.auto',
                              ),
                            }),
                    },
                    { value: 'auto', label: t('identity.newConversations.auto') },
                    { value: 'ask', label: t('identity.newConversations.ask') },
                  ]}
                />
              )}
            </Field>
          )}
          <Field label={t('identity.conversations')} group>
            {() => (
              <ExternalConversations
                identity={selected}
                snapshot={snapshot}
                busy={busy}
                t={t}
                change={(input) => operate(() => conversation(input))}
                rules={(grantId, input) => operate(() => rules(grantId, input))}
                {...(channels ? { channels } : {})}
                {...(selected.platform === 'qq' && sync
                  ? {
                      sync: (grant, channelId, enabled) =>
                        operate(() => sync(grant, channelId, enabled)),
                      syncChannels: syncChannels ?? [],
                    }
                  : {})}
              />
            )}
          </Field>
        </FormDialog>
      ) : (mode === 'reconnect' || mode === 'unbind') && selected ? (
        <ConfirmDialog
          title={t(mode === 'unbind' ? 'identity.unbind' : 'identity.reconnect')}
          labels={labels}
          confirmLabel={t(
            busy
              ? 'identity.pending'
              : mode === 'unbind'
                ? 'identity.confirmUnbind'
                : 'identity.reconnect',
          )}
          danger={mode === 'unbind'}
          busy={busy}
          error={error || undefined}
          onCancel={close}
          onConfirm={() => void operate(save, true)}
        >
          <p {...stylex.props(styles.subject)}>
            {platform(selected.platform)} · {selected.name}
          </p>
          {mode === 'reconnect' ? (
            <p {...stylex.props(styles.text)}>{t('identity.reconnectHint')}</p>
          ) : (
            <>
              <p {...stylex.props(styles.text)}>
                {t('identity.impact', { count: selected.grantCount })}
              </p>
              <ul {...stylex.props(styles.list)}>
                {selected.scopes.map((scope, index) => (
                  <li key={index}>{scope}</li>
                ))}
              </ul>
              <p {...stylex.props(styles.text)}>{t('identity.unbindHint')}</p>
            </>
          )}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
