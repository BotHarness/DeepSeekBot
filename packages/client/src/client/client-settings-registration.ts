import type { Context as ClientContext } from '@deepseek-ai/cordis';
import {
  BOT_MODE_NAMESPACE,
  type BotModeSettings,
} from '@botharness/host-client/shared/bot-mode-settings';
import type { BridgeActions } from './actions.js';
import type { Appearance } from './appearance.js';
import { AppearanceSection } from './appearance-settings.js';
import { readBotColorScheme, subscribeBotColorScheme } from './bot-color-scheme.js';
import { botIconMarkup } from './bot-icon.js';
import { installBotNavIcon } from './bot-icon-nav.js';
import { botModePrefsFace, type BotModePrefs } from './bot-mode-prefs.js';
import { BOT_SETTINGS_SECTIONS, type BotSettings } from './bot-settings.js';
import {
  AboutSection,
  AdvancedSection,
  CompanionsSection,
  DataPrivacySection,
  DevicesSection,
  AccountSection,
  GeneralSection,
  MessagingSection,
  registerModelSettingsSections,
  PromptsSection,
  VoiceSection,
} from './bot-settings-sections.js';
import type { BridgeCall } from './bridge.js';
import { startConnectSignIn } from './connect-sign-in.js';
import type { DesktopNotificationPrefs } from './desktop-notifications.js';
import { DshBotSettingsItem } from './dsh-bot-settings-item.js';
import { createImApps, ImAppsSection } from './im-apps-section.js';
import { KeyboardSettings } from './keyboard-settings.js';
import { LOCALE_NS, type BotHarnessTranslate } from './locale.js';
import { DesktopNotificationSetting } from './notification-settings.js';
import type { ReleaseNotesController } from './release-notes.js';
import type { ShortcutBindings } from './shortcut-bindings.js';
import { store } from './store.js';
import { TeamSection } from './team-settings.js';
import type { UpdateRunsController } from './update-runs.js';
import type { Wallpaper } from './wallpaper.js';
import type { WindowCompanions } from './window-companions.js';
import type { ZoomSurface } from './window-zoom-mount.js';

export function registerClientSettings(
  ctx: ClientContext,
  {
    t,
    prefs,
    actions,
    call,
    botSettings,
    appearance,
    wallpaper,
    zoomSurface,
    desktopNotifications,
    shortcutBindings,
    companion,
    releaseNotes,
    updateRuns,
  }: {
    t: BotHarnessTranslate;
    prefs: BotModePrefs;
    actions: BridgeActions;
    call: BridgeCall;
    botSettings: BotSettings;
    appearance: Appearance;
    wallpaper: Wallpaper;
    zoomSurface: ZoomSurface;
    desktopNotifications: DesktopNotificationPrefs;
    shortcutBindings: ShortcutBindings;
    companion: WindowCompanions;
    releaseNotes: ReleaseNotesController;
    updateRuns: UpdateRunsController;
  },
): void {
  ctx.inject(['configForms'], (settingsCtx) => {
    const scope = settingsCtx.configForms.get<BotModeSettings>(BOT_MODE_NAMESPACE);
    prefs.attach({
      getSnapshot: () => ({ ...scope.getSnapshot(), mode: 'host' }),
      subscribe: (listener) => scope.subscribe(listener),
      set: (field, value) => scope.set(field, value),
      mutate: (ops, expectedRevision) => scope.mutate(ops, expectedRevision),
    });
    const releaseNavIcon = installBotNavIcon({
      labels: () => [t('settings.nav')],
      markup: () => botIconMarkup(prefs.source.getSnapshot().botIcon, readBotColorScheme()),
      subscribe: (listener) => {
        const offPrefs = prefs.source.subscribe(listener);
        const offScheme = subscribeBotColorScheme(listener);
        return () => {
          offPrefs();
          offScheme();
        };
      },
    });
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.account,
          order: -5,
          label: () => t('botSettings.section.account'),
          locale: LOCALE_NS,
          inject: () => ({
            actions,
            startSignIn: startConnectSignIn,
            call,
            store,
            onSaved: () => actions.refreshRoster(),
          }),
        },
        AccountSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.general,
          order: 0,
          label: () => t('botSettings.section.general'),
          locale: LOCALE_NS,
          inject: () => ({
            ...botModePrefsFace(prefs),
            actions,
            closeBotSettings: botSettings.close,
            zoomSurface,
            localeSource: {
              getSnapshot: () => ctx.locale.getSnapshot(),
              subscribe: (listener: () => void) => ctx.locale.subscribe(listener),
              setLocale: (value: string) => ctx.locale.setLocale(value),
            },
          }),
        },
        GeneralSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.appearance,
          order: 5,
          label: () => t('botSettings.section.appearance'),
          locale: LOCALE_NS,
          children: {
            'botharness.settings.layout': { kind: 'list', scope: 'root' },
          },
          inject: () => ({
            ...botModePrefsFace(prefs),
            appearance,
            wallpaper,
          }),
        },
        AppearanceSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.notifications,
          order: 21,
          label: () => t('botSettings.section.notifications'),
          locale: LOCALE_NS,
          inject: () => ({ desktopNotifications }),
        },
        DesktopNotificationSetting,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.shortcuts,
          order: 22,
          label: () => t('shortcuts.title'),
          locale: LOCALE_NS,
          inject: () => ({
            ...botModePrefsFace(prefs),
            shortcutBindings,
            shortcuts: ctx.shortcuts,
          }),
        },
        KeyboardSettings,
      ),
    );
    registerModelSettingsSections(settingsCtx, { t, prefs, actions, call, store });
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.prompts,
          order: 16,
          label: () => t('botSettings.section.prompts'),
          locale: LOCALE_NS,
          inject: () => ({ actions }),
        },
        PromptsSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.voice,
          order: 17,
          label: () => t('botSettings.section.voice'),
          locale: LOCALE_NS,
          inject: () => ({ actions }),
        },
        VoiceSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.messaging,
          order: 20,
          label: () => t('botSettings.section.messaging'),
          locale: LOCALE_NS,
          inject: () => ({
            ...botModePrefsFace(prefs),
            call,
            store,
            onSaved: () => actions.refreshRoster(),
          }),
        },
        MessagingSection,
      ),
    );
    const imApps = createImApps({ call, botSettings, actions });
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.imApps,
          order: 25,
          label: () => t('botSettings.section.imApps'),
          locale: LOCALE_NS,
          inject: () => ({ imApps, store, call }),
        },
        ImAppsSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.companions,
          order: 40,
          label: () => t('botSettings.section.companions'),
          locale: LOCALE_NS,
          inject: () => ({ companion }),
        },
        CompanionsSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.team,
          order: 44,
          label: () => t('botSettings.section.team'),
          locale: LOCALE_NS,
          inject: () => ({ call }),
        },
        TeamSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.devices,
          order: 45,
          label: () => t('botSettings.section.devices'),
          locale: LOCALE_NS,
          inject: () => ({ call }),
        },
        DevicesSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.dataPrivacy,
          order: 50,
          label: () => t('botSettings.section.dataPrivacy'),
          locale: LOCALE_NS,
          inject: () => ({ call }),
        },
        DataPrivacySection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.advanced,
          order: 60,
          label: () => t('botSettings.section.advanced'),
          locale: LOCALE_NS,
          inject: () => ({ ...botModePrefsFace(prefs), call }),
        },
        AdvancedSection,
      ),
    );
    settingsCtx.slots.inject('botharness.settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: BOT_SETTINGS_SECTIONS.about,
          order: 70,
          label: () => t('botSettings.section.about'),
          locale: LOCALE_NS,
          inject: () => ({ releaseNotes, call, updateRuns }),
        },
        AboutSection,
      ),
    );
    settingsCtx.slots.inject('settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'settings.section',
          id: 'botharness',
          order: 25,
          label: () => t('settings.nav'),
          locale: LOCALE_NS,
          inject: () => ({
            openBotSettings: (sectionId?: string) => botSettings.open(sectionId),
          }),
        },
        DshBotSettingsItem,
      ),
    );
    return () => {
      releaseNavIcon();
      prefs.detach();
    };
  });
}
