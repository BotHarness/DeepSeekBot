import { useState, useSyncExternalStore, type ReactElement } from 'react';

import { Button, closeTopModal, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import type { BridgeActions } from './actions.js';
import { BOT_SETTINGS_SECTIONS, type BotSettings } from './bot-settings.js';
import { openExternalBindingSettings } from './bot-settings-open.js';
import { externalPlatformLabel } from './bridge-source-label.js';
import { loadMessagingApps, type BridgeCall, type MessagingApp } from './bridge.js';
import { Combobox } from './combobox.js';
import { EmptyState } from './ds/empty-state.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsRows, SettingsValue } from './ds/settings-row.js';
import { CreateAppForm } from './create-app-form.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';
import type { AppSetupDescriptor, ProviderAppSetup } from './provider-app-setup.js';
import type { ClientStore } from './store.js';

export type ImAppsNotice = 'settings-unavailable';

export interface ImAppsList {
  apps: MessagingApp[];
  setups: AppSetupDescriptor[];
}

export interface ImAppsFace {
  load(): Promise<ImAppsList>;
  manage(): void;
  takeNotice(): ImAppsNotice | undefined;
  bind(app: MessagingApp, botSlug: string): Promise<void>;
  unbind(app: MessagingApp): Promise<void>;
  bindCreated(botSlug: string): Promise<void>;
  appSetup?: ProviderAppSetup;
}

export function createImApps({
  call,
  botSettings,
  actions,
  openDshSettings = (returned, unavailable) =>
    openExternalBindingSettings(document, returned, () => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]') !== null)
        closeTopModal(document);
      unavailable();
    }),
}: {
  call: BridgeCall;
  botSettings: Pick<BotSettings, 'open' | 'close'>;
  actions: Pick<BridgeActions, 'messagingIdentity' | 'messagingSnapshot' | 'appSetup'>;
  openDshSettings?: (returned: () => void, unavailable: () => void) => () => void;
}): ImAppsFace {
  let notice: ImAppsNotice | undefined;
  let stop: (() => void) | undefined;
  return {
    load: () => loadMessagingApps(call),
    manage: () => {
      stop?.();
      botSettings.close();
      stop = openDshSettings(
        () => {
          botSettings.open(BOT_SETTINGS_SECTIONS.imApps);
        },
        () => {
          notice = 'settings-unavailable';
          botSettings.open(BOT_SETTINGS_SECTIONS.imApps);
        },
      );
    },
    takeNotice: () => {
      const taken = notice;
      notice = undefined;
      return taken;
    },
    bind: async (app, botSlug) => {
      await actions.messagingIdentity(botSlug, {
        kind: 'bind',
        providerId: app.providerId,
        accountRef: app.ref,
        fingerprint: app.fingerprint,
      });
    },
    unbind: async (app) => {
      if (app.boundBotSlug === undefined || app.bindingId === undefined)
        throw new Error('not-bound');
      const snapshot = await actions.messagingSnapshot(app.boundBotSlug);
      const identity = snapshot.identities?.find((candidate) => candidate.id === app.bindingId);
      if (identity === undefined) throw new Error('binding-missing');
      await actions.messagingIdentity(app.boundBotSlug, {
        kind: 'unbind',
        id: identity.id,
        expectedRevision: identity.revision,
      });
    },
    bindCreated: async (botSlug) => {
      const setup = actions.appSetup;
      if (setup === undefined) throw new Error('setup-unavailable');
      await actions.messagingIdentity(botSlug, setup.binding(botSlug));
      setup.forget(botSlug);
    },
    ...(actions.appSetup === undefined ? {} : { appSetup: actions.appSetup }),
  };
}

type Loaded = { status: 'loading' } | { status: 'failed' } | ({ status: 'ready' } & ImAppsList);

type Dialog =
  | { kind: 'bind'; app: MessagingApp }
  | { kind: 'unbind'; app: MessagingApp }
  | { kind: 'create'; creating: boolean };

export function ImAppsSection({
  imApps,
  store,
  t,
}: PropsLocale<'botharness'> &
  InjectFace<{ imApps: ImAppsFace; store: ClientStore }>): ReactElement {
  const bots = useSyncExternalStore(store.subscribe, () => store.getSnapshot().bots);
  const [notice] = useState(() => imApps.takeNotice());
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [dialog, setDialog] = useState<Dialog>();
  const [botSlug, setBotSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const reload = async (): Promise<void> => {
    try {
      setLoaded({ status: 'ready', ...(await imApps.load()) });
    } catch {
      setLoaded({ status: 'failed' });
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    imApps.load().then(
      (list) => {
        if (active) setLoaded({ status: 'ready', ...list });
      },
      () => {
        if (active) setLoaded({ status: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [imApps]);
  const botName = (slug: string): string =>
    bots.find((bot) => bot.slug === slug)?.displayName ?? t('imApps.removedBot');
  const open = (next: Dialog): void => {
    setBotSlug('');
    setFailed(false);
    setDialog(next);
  };
  const dismiss = (): void => {
    if (!busy) setDialog(undefined);
  };
  const run = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      await operation();
      setDialog(undefined);
      await reload();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const botPicker = (
    <Combobox
      label={t('imApps.bot')}
      toggleLabel={t('imApps.bot')}
      placeholder={t('imApps.chooseBot')}
      searchable={false}
      disabled={busy}
      value={botSlug}
      onSelect={setBotSlug}
      options={bots.map((bot) => ({ value: bot.slug, label: bot.displayName }))}
    />
  );
  const error = failed ? (
    <p role="alert" className="bh-error">
      {t('imApps.failed')}
    </p>
  ) : null;
  const canCreate =
    imApps.appSetup !== undefined && loaded.status === 'ready' && loaded.setups.length > 0;
  return (
    <SettingsRows rootRef={mount}>
      <SettingsRow
        title={t('imApps.allApps')}
        description={t('imApps.description')}
        control={
          <>
            {canCreate && loaded.status === 'ready' && loaded.apps.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  open({ kind: 'create', creating: false });
                }}
              >
                {t('imApps.create')}
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={imApps.manage}>
              {t('imApps.manage')}
            </Button>
          </>
        }
      >
        {notice === 'settings-unavailable' ? <Note>{t('imApps.settingsUnavailable')}</Note> : null}
      </SettingsRow>
      {loaded.status === 'loading' ? null : loaded.status === 'failed' ? (
        <EmptyState status title={t('imApps.loadFailed')} />
      ) : loaded.apps.length === 0 ? (
        <EmptyState
          title={t('imApps.empty')}
          description={t('imApps.emptyHint')}
          action={
            canCreate ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  open({ kind: 'create', creating: false });
                }}
              >
                {t('imApps.create')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {loaded.apps.map((app) => (
            <SettingsRow
              key={`${app.providerId}:${app.ref}`}
              data={{ 'data-im-app': app.ref }}
              title={app.name}
              description={`${externalPlatformLabel(app.platform, t)} · ${t(
                app.connected ? 'imApps.connected' : 'imApps.disconnected',
              )}`}
              control={
                app.boundBotSlug === undefined ? (
                  <>
                    <Tag>{t('imApps.unbound')}</Tag>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!app.connected || app.unsupported !== undefined}
                      aria-label={t('imApps.bindFor', { app: app.name })}
                      onClick={() => {
                        open({ kind: 'bind', app });
                      }}
                    >
                      {t('imApps.bind')}
                    </Button>
                  </>
                ) : (
                  <>
                    <SettingsValue>{botName(app.boundBotSlug)}</SettingsValue>
                    {bots.some((bot) => bot.slug === app.boundBotSlug) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t('imApps.unbindFor', { app: app.name })}
                        onClick={() => {
                          open({ kind: 'unbind', app });
                        }}
                      >
                        {t('imApps.unbind')}
                      </Button>
                    ) : null}
                  </>
                )
              }
            />
          ))}
        </>
      )}
      <Modal
        open={dialog?.kind === 'bind'}
        onClose={dismiss}
        closeLabel={t('common.close')}
        title={dialog?.kind === 'bind' ? t('imApps.bindFor', { app: dialog.app.name }) : ''}
        footer={
          <div className="bh-sidebar-modal-actions">
            <Button variant="outline" disabled={busy} onClick={dismiss}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={busy || botSlug === ''}
              onClick={() => {
                if (dialog?.kind === 'bind') void run(() => imApps.bind(dialog.app, botSlug));
              }}
            >
              {t('imApps.bind')}
            </Button>
          </div>
        }
      >
        <div className="bh-sidebar-modal-form">
          {error}
          {botPicker}
        </div>
      </Modal>
      <Modal
        open={dialog?.kind === 'unbind'}
        onClose={dismiss}
        closeLabel={t('common.close')}
        title={dialog?.kind === 'unbind' ? t('imApps.unbindFor', { app: dialog.app.name }) : ''}
        footer={
          <div className="bh-sidebar-modal-actions">
            <Button variant="outline" disabled={busy} onClick={dismiss}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              className="bh-im-danger"
              disabled={busy}
              onClick={() => {
                if (dialog?.kind === 'unbind') void run(() => imApps.unbind(dialog.app));
              }}
            >
              {t('imApps.unbind')}
            </Button>
          </div>
        }
      >
        <div className="bh-sidebar-modal-form">
          {error}
          {dialog?.kind === 'unbind' && dialog.app.boundBotSlug !== undefined ? (
            <p>
              {t('imApps.unbindHint', {
                bot: botName(dialog.app.boundBotSlug),
                app: dialog.app.name,
              })}
            </p>
          ) : null}
        </div>
      </Modal>
      <Modal
        open={dialog?.kind === 'create'}
        onClose={dismiss}
        closeLabel={t('common.close')}
        title={t('imApps.create')}
        {...(dialog?.kind === 'create' && dialog.creating
          ? {}
          : {
              footer: (
                <div className="bh-sidebar-modal-actions">
                  <Button variant="outline" onClick={dismiss}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={botSlug === ''}
                    onClick={() => {
                      setDialog({ kind: 'create', creating: true });
                    }}
                  >
                    {t('imApps.next')}
                  </Button>
                </div>
              ),
            })}
      >
        <div className="bh-sidebar-modal-form">
          {error}
          {dialog?.kind === 'create' && dialog.creating && imApps.appSetup !== undefined ? (
            <CreateAppForm
              client={imApps.appSetup}
              botSlug={botSlug}
              descriptors={loaded.status === 'ready' ? loaded.setups : []}
              t={t}
              onBack={() => {
                setDialog({ kind: 'create', creating: false });
              }}
              onCreated={() => run(() => imApps.bindCreated(botSlug))}
            />
          ) : (
            <>
              <p>{t('imApps.createHint')}</p>
              {botPicker}
            </>
          )}
        </div>
      </Modal>
    </SettingsRows>
  );
}
