import { providerBrand } from '@botharness/host-client/shared/model-brand';
import type { ModelProvidersView } from '@botharness/host-client/model-providers';
import type { SubscriptionModel } from '@botharness/host-client/model-plans';
import { Button } from './ds/button.js';
import { ChoiceButton } from './ds/choice-button.js';
import { ReadFailure } from './ds/read-failure.js';
import { bridgeHost, type BridgeCall } from './bridge.js';
import { BOT_SETTINGS_SECTIONS, type BotSettings } from './bot-settings.js';
import { engineModelKey, useSubscriptionEngines } from './engine-choice.js';
import { engineName } from './session-engine.js';
import { engineMenuItems } from './model-menu.js';
import { ModelBrandIcon } from './model-brand.js';
import { AddModelProvider, ModelProviderSubscriptions } from './model-providers-settings.js';
import { canManageModelProviders } from './team-bridge.js';
import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type { BridgeActions } from './actions.js';
import { errorMessage, type ModelCatalogView, type ModelRouteView } from './bridge.js';
import { BotIcon } from './bot-icon.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Icon } from './ds/icon.js';
import { IconButton } from './ds/icon-button.js';
import { Note } from './ds/note.js';
import { border, color, dialog, radius, size, space, text } from './ds/tokens.stylex.js';
import { space as tobsSpace } from './ds/tobs.stylex.js';
import { ConnectionsDialog } from './connections-dialog.js';
import { Modal } from './modal.js';
import { ModelPicker } from './model-picker.js';
import type { Appearance, AppearancePatch } from './appearance.js';
import { AppearanceMaterialSettings } from './appearance-material-settings.js';
import {
  ColorSchemePicker,
  LayoutModePicker,
  ThemePresetPicker,
  applyPreset,
} from './appearance-pickers.js';
import type { LayoutMode } from './layout-mode.js';
import { WallpaperLibrary } from './wallpaper-library.js';
import type { Wallpaper } from './wallpaper.js';
import { CommunityIcon } from './community-icons.js';
import { COMMUNITY, cachedGithubStars, fetchGithubStars, formatStars } from './community-links.js';
import { requestTobMessage } from './tob-requests.js';
import { refreshTeamMode, useTeamMember, useTeamModeRead } from './team-state.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import {
  INTRO_STEPS,
  onboardingFor,
  type IntroOutcome,
  type IntroStartOutcome,
} from './onboarding.js';
import {
  ONBOARDING_PERSONAS,
  PERSONA_DETAILS,
  PERSONA_TEMPLATES,
  browserTimeZone,
  type OnboardingFeature,
  type OnboardingPersona,
  type PersonaDetail,
  type PersonaPrompt,
} from './onboarding-personas.js';
import { invalidateInheritedModelPlans } from './model-plan-store.js';
import { observeResource } from './messaging-defaults-live.js';

export { INTRO_STEPS };
export type IntroStep = (typeof INTRO_STEPS)[number];

const REVIEWS: readonly BotHarnessKey[] = [
  'intro.reviews.clean',
  'intro.reviews.era',
  'intro.reviews.details',
];

const FEATURE_ICONS: Readonly<Record<OnboardingFeature, string>> = {
  bot: 'bot',
  group: 'users',
  schedule: 'alarm-clock',
  browser: 'globe',
  memory: 'brain',
  im: 'plug',
};

const styles = stylex.create({
  modelForm: {
    display: 'grid',
    gap: space.x5,
    minWidth: 0,
    lineHeight: text.bodyLine,
  },
  dialog: {
    width: dialog.medium,
    maxWidth: '100%',
    height: '600px',
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    paddingBottom: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x4,
    paddingBlock: space.x5,
    paddingInline: space.x6,
    borderBottomWidth: border.hairline,
    borderBottomStyle: 'solid',
    borderBottomColor: color.divider,
  },
  stepper: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    flexGrow: 1,
    minWidth: 0,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
    flexGrow: { default: 1, ':last-child': 0 },
  },
  stepButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x3,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: color.muted,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    whiteSpace: 'nowrap',
    cursor: { default: 'pointer', ':disabled': 'default' },
    outline: {
      default: 'none',
      ':focus-visible': `${border.focus} solid ${color.accent}`,
    },
    outlineOffset: '2px',
    borderRadius: radius.sm,
  },
  stepCurrent: { color: color.fg, fontWeight: text.strong },
  stepDot: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size.inlineIcon,
    height: size.inlineIcon,
    borderRadius: radius.round,
    cornerShape: 'round',
    backgroundColor: color.surface,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  stepDotActive: { backgroundColor: color.accent, color: color.onAccent },
  stepLabel: { '@media (max-width: 760px)': { display: 'none' } },
  stepLine: {
    flexGrow: 1,
    minWidth: space.x4,
    height: border.hairline,
    backgroundColor: color.border,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x6,
    flexGrow: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: space.x6,
  },
  bodyCentered: { justifyContent: 'safe center' },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    paddingBlock: space.x5,
    paddingInline: space.x6,
    borderTopWidth: border.hairline,
    borderTopStyle: 'solid',
    borderTopColor: color.divider,
  },
  progress: {
    flexGrow: 1,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.x4,
    textAlign: 'center',
  },
  heroCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    maxWidth: '560px',
  },
  title: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  copy: {
    margin: 0,
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  letter: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    padding: space.x5,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  reviews: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: space.x3,
  },
  review: {
    margin: 0,
    padding: space.x4,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  choices: {
    display: 'flex',
    flexDirection: 'column',
    gap: tobsSpace.x2,
  },
  providers: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tobsSpace.x2,
  },
  provider: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tobsSpace.x1,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  advanced: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    padding: space.x4,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  advancedSummary: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    cursor: 'pointer',
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
  },
  starterItem: { display: 'flex', flexDirection: 'column' },
  note: { display: 'flex', flexDirection: 'column', gap: space.x2 },
  signature: {
    margin: 0,
    alignSelf: 'flex-end',
    color: color.muted,
    fontSize: text.bodySize,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    minWidth: 0,
  },
  layoutHint: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  sectionTitle: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x4,
    padding: space.x4,
    borderWidth: 0,
    borderRadius: radius.lg,
    backgroundColor: { default: color.surface, ':hover': color.hover },
    color: color.fg,
    textDecoration: 'none',
    outline: {
      default: 'none',
      ':focus-visible': `${border.focus} solid ${color.accent}`,
    },
  },
  linkIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size.nav,
    height: size.nav,
    borderRadius: radius.md,
    backgroundColor: color.modal,
    color: color.fg,
  },
  linkText: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
  },
  linkTitle: {
    fontWeight: text.strong,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
  },
  stars: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    flexShrink: 0,
    paddingInline: space.x4,
    height: size.icon,
    borderRadius: radius.sm,
    backgroundColor: color.modal,
    color: color.fg,
    fontWeight: text.strong,
    whiteSpace: 'nowrap',
  },
  starters: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    width: '100%',
    maxWidth: '560px',
  },
  personas: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: space.x3,
  },
  wide: { maxWidth: 'none' },
  persona: { height: '100%', alignItems: 'flex-start' },
  interviewIcon: { backgroundColor: color.accent, color: color.onAccent },
  personaActions: { display: 'flex', justifyContent: 'center', gap: space.x3 },
  chosen: {
    backgroundColor: { default: color.accentTint, ':hover': color.accentTint },
  },
  chosenIcon: { backgroundColor: color.accent, color: color.onAccent },
  chosenChip: {
    backgroundColor: { default: color.accent, ':hover': color.accent },
    color: color.onAccent,
  },
  details: { display: 'flex', flexDirection: 'column', gap: space.x2 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: space.x2 },
  chip: {
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: color.surface, ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.bodyLine,
    cursor: 'pointer',
    outline: {
      default: 'none',
      ':focus-visible': `${border.focus} solid ${color.accent}`,
    },
  },
  still: {
    backgroundColor: { default: color.surface, ':hover': color.surface },
  },
  soft: {
    borderWidth: 0,
    backgroundColor: { default: color.surface, ':hover': color.hover },
    color: color.fg,
  },
  onCard: { backgroundColor: { default: color.modal, ':hover': color.hover } },
  strong: { color: color.fg, fontWeight: text.strong },
  meta: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  starter: {
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: 'pointer',
  },
});

export function BotIntro({
  actions,
  call,
  botSettings,
  appearance,
  wallpaper,
  t,
}: {
  actions: BridgeActions;
  call?: BridgeCall | undefined;
  botSettings?: Pick<BotSettings, 'open' | 'subscribe' | 'getSnapshot'> | undefined;
  appearance?: Appearance | undefined;
  wallpaper?: Wallpaper | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const controller = onboardingFor(actions);
  const member = useTeamMember();
  const providersOpen = useSyncExternalStore(
    botSettings?.subscribe ?? noSubscribe,
    () => botSettings?.getSnapshot().open === true,
    () => false,
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const media = useSyncExternalStore(wallpaper?.subscribe ?? noSubscribe, () =>
    wallpaper?.getSnapshot(),
  );
  const intro = state.intro;
  const [model, setModel] = useState<ModelStepBinding>();
  const [busy, setBusy] = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);
  const modelDraft = useState<ModelStepDraft>(EMPTY_MODEL_DRAFT);
  const navigationBusy = busy || providerSaving;
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneDevice, setPhoneDevice] = useState<string>();
  const [phoneRead, setPhoneRead] = useState(false);
  const startPicks = useState<StartPicks>(NO_PICKS);
  const close = (outcome?: IntroOutcome): Promise<void> => {
    if (navigationBusy) return Promise.resolve();
    startPicks[1](NO_PICKS);
    modelDraft[1](EMPTY_MODEL_DRAFT);
    setPhoneOpen(false);
    setPhoneDevice(undefined);
    setPhoneRead(false);
    return controller.closeIntro(outcome);
  };
  const clear =
    intro !== undefined &&
    (INTRO_STEPS[intro.step] ?? 'welcome') === 'theme' &&
    media?.current !== undefined;
  const seeThrough = clear && !intro.hidden;
  useLayoutEffect(() => {
    if (!seeThrough) return;
    const root = document.documentElement;
    root.setAttribute('data-bh-intro-see-through', '');
    return () => root.removeAttribute('data-bh-intro-see-through');
  }, [seeThrough]);
  const phoneStatusMount = useMountedResource<HTMLDivElement>(() => {
    if (!phoneDevice) return;
    const abort = new AbortController();
    let pending = false;
    let again = false;
    const refresh = async (): Promise<void> => {
      if (pending) {
        again = true;
        return;
      }
      pending = true;
      try {
        const response = await fetch('./api/botharness/devices', {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(12_000)]),
        });
        if (!response.ok) throw new Error('unavailable');
        const value = (await response.json()) as {
          devices: { id: string; feedReadAt?: string; revokedAt?: string }[];
        };
        if (!abort.signal.aborted)
          setPhoneRead(
            value.devices.some(
              (device) => device.id === phoneDevice && !!device.feedReadAt && !device.revokedAt,
            ),
          );
      } catch {
        if (!abort.signal.aborted) setPhoneRead(false);
      } finally {
        pending = false;
      }
      if (again && !abort.signal.aborted) {
        again = false;
        await refresh();
      }
    };
    void refresh();
    const stopObserving = observeResource('devices', () => void refresh(), 3000);
    return () => {
      abort.abort();
      stopObserving();
    };
  }, [phoneDevice]);
  if (!intro) return null;
  const step = INTRO_STEPS[intro.step] ?? 'welcome';
  const last = intro.step === INTRO_STEPS.length - 1;
  const modelAdvanceBlocked = step === 'model' && model?.canAdvance !== true;
  const go = async (next: number) => {
    if (navigationBusy) return;
    if (step === 'model') {
      if (next > intro.step) {
        if (model?.canAdvance !== true) return;
        setBusy(true);
        const saved = await model.save().finally(() => setBusy(false));
        if (!saved) return;
      }
      if (next !== intro.step) modelDraft[1](EMPTY_MODEL_DRAFT);
    }
    controller.setIntroStep(next);
  };
  if (phoneOpen)
    return (
      <ConnectionsDialog
        t={t}
        pairPhone={!phoneRead}
        pairedDeviceId={phoneDevice}
        onDevicePaired={setPhoneDevice}
        onClose={() => setPhoneOpen(false)}
        onFeedRead={
          phoneRead
            ? undefined
            : () => {
                setPhoneRead(true);
                setPhoneOpen(false);
              }
        }
      />
    );
  return (
    <Modal
      open={!intro.hidden && !(step === 'model' && providersOpen)}
      headless
      title={t('intro.title')}
      onClose={() => void close({ via: 'close' })}
      backdropBlur={!clear}
      className={
        (stylex.props(styles.dialog).className ?? '') + (clear ? ' bh-intro-see-through' : '')
      }
    >
      <div {...stylex.props(styles.header)}>
        <ol {...stylex.props(styles.stepper)} aria-label={t('intro.title')}>
          {INTRO_STEPS.map((id, index) => (
            <li key={id} {...stylex.props(styles.stepItem)}>
              <button
                type="button"
                aria-label={`${index + 1} ${t(`intro.step.${id}`)}`}
                aria-current={index === intro.step ? 'step' : undefined}
                {...stylex.props(styles.stepButton, index === intro.step && styles.stepCurrent)}
                disabled={navigationBusy || (index > intro.step && modelAdvanceBlocked)}
                onClick={() => void go(index)}
              >
                <span
                  {...stylex.props(styles.stepDot, index <= intro.step && styles.stepDotActive)}
                >
                  {index < intro.step && (id !== 'phone' || phoneRead) ? (
                    <ChannelSidebarIcon name="check" size={14} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span {...stylex.props(styles.stepLabel)}>{t(`intro.step.${id}`)}</span>
              </button>
              {index < INTRO_STEPS.length - 1 ? (
                <span aria-hidden="true" {...stylex.props(styles.stepLine)} />
              ) : null}
            </li>
          ))}
        </ol>
        <IconButton
          aria-label={t('common.close')}
          size="icon"
          disabled={navigationBusy}
          onClick={() => void close({ via: 'close' })}
        >
          <ChannelSidebarIcon name="x" size={16} />
        </IconButton>
      </div>
      <div
        {...stylex.props(
          styles.body,
          (step === 'welcome' || step === 'start') && styles.bodyCentered,
        )}
        data-intro-step={step}
      >
        {step === 'welcome' ? <WelcomeStep t={t} /> : null}
        {step === 'theme' && appearance ? (
          <ThemeStep
            appearance={appearance}
            wallpaper={wallpaper}
            layoutMode={state.layoutMode}
            onLayoutMode={(mode) => controller.chooseLayout(mode)}
            t={t}
            track={(setting) => controller.introEvent('onboarding:theme_update', { setting })}
          />
        ) : null}
        {step === 'model' ? (
          <ModelStep
            actions={actions}
            call={call}
            member={member}
            t={t}
            draft={modelDraft}
            bind={setModel}
            saving={busy}
            onProviderSavingChange={setProviderSaving}
            openProviders={
              botSettings === undefined
                ? undefined
                : () => botSettings.open(BOT_SETTINGS_SECTIONS.modelProviders)
            }
          />
        ) : null}
        {step === 'phone' ? (
          <div ref={phoneStatusMount} {...stylex.props(styles.hero)}>
            <ChannelSidebarIcon name="smartphone" size={48} />
            <div {...stylex.props(styles.heroCopy)}>
              <h2 {...stylex.props(styles.title)}>{t('intro.phone.title')}</h2>
              <p {...stylex.props(styles.copy)} role="status">
                {t(phoneRead ? 'intro.phone.connected' : 'intro.phone.body')}
              </p>
              <Button
                variant={phoneRead ? 'outline' : 'primary'}
                data-modal-autofocus
                onClick={() => setPhoneOpen(true)}
              >
                {t('intro.phone.connect')}
              </Button>
            </div>
          </div>
        ) : null}
        {step === 'community' ? (
          <CommunityStep
            t={t}
            track={(target) =>
              controller.introEvent('onboarding:community_link_click', {
                target,
              })
            }
          />
        ) : null}
        {step === 'start' ? (
          <StartStep
            t={t}
            picks={startPicks}
            track={({ persona, detail }) =>
              controller.introEvent(
                detail ? 'onboarding:persona_detail_select' : 'onboarding:persona_select',
                detail ? { persona, detail } : { persona },
              )
            }
            pick={(outcome, body) =>
              void close(outcome).then(() => {
                if (body !== undefined && !member) requestTobMessage(body);
              })
            }
          />
        ) : null}
      </div>
      <div {...stylex.props(styles.footer)}>
        <span {...stylex.props(styles.progress)}>
          {t('intro.progress', {
            current: String(intro.step + 1),
            total: String(INTRO_STEPS.length),
          })}
        </span>
        {last || step === 'phone' ? null : (
          <Button
            variant="ghost"
            disabled={navigationBusy}
            onClick={() => void close({ via: 'skip' })}
          >
            {t('intro.skip')}
          </Button>
        )}
        {intro.step > 0 ? (
          <Button
            variant="outline"
            disabled={navigationBusy}
            onClick={() => void go(intro.step - 1)}
            {...stylex.props(styles.soft)}
          >
            {t('intro.back')}
          </Button>
        ) : null}
        {last ? null : (
          <Button
            variant={
              (step === 'phone' && !phoneRead) || (step === 'model' && model?.keyForm)
                ? 'outline'
                : 'primary'
            }
            data-modal-autofocus={step !== 'phone'}
            disabled={navigationBusy || modelAdvanceBlocked}
            onClick={() => void go(intro.step + 1)}
          >
            {t(step === 'phone' && !phoneRead ? 'intro.phone.skip' : 'intro.next')}
          </Button>
        )}
      </div>
    </Modal>
  );
}

const noSubscribe = () => () => {};

function WelcomeStep({ t }: { t: BotHarnessTranslate }): ReactElement {
  return (
    <>
      <div {...stylex.props(styles.hero)}>
        <BotIcon icon="mascot" size={96} />
        <div {...stylex.props(styles.heroCopy)}>
          <h2 {...stylex.props(styles.title)}>{t('intro.welcome.greeting')}</h2>
          <p {...stylex.props(styles.copy)}>{t('intro.welcome.body')}</p>
          <p {...stylex.props(styles.copy)}>{t('intro.welcome.next')}</p>
        </div>
      </div>
    </>
  );
}

function Voices({ t }: { t: BotHarnessTranslate }): ReactElement {
  return (
    <>
      <section {...stylex.props(styles.section)} aria-label={t('intro.reviews.title')}>
        <h3 {...stylex.props(styles.sectionTitle)}>{t('intro.reviews.title')}</h3>
        <div {...stylex.props(styles.reviews)} data-user-reviews>
          {REVIEWS.map((key) => (
            <blockquote key={key} {...stylex.props(styles.review)}>
              {t(key)}
            </blockquote>
          ))}
        </div>
      </section>
      <section {...stylex.props(styles.letter)} aria-label={t('intro.founder.title')}>
        <h3 {...stylex.props(styles.sectionTitle)}>{t('intro.founder.title')}</h3>
        <div {...stylex.props(styles.note)} data-founder-note>
          {t('intro.founder.body')
            .split('\n')
            .map((line) => (
              <p key={line} {...stylex.props(styles.copy)}>
                {line}
              </p>
            ))}
        </div>
        <p {...stylex.props(styles.signature)}>{t('intro.founder.signature')}</p>
      </section>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section {...stylex.props(styles.section)} aria-label={title}>
      <h3 {...stylex.props(styles.sectionTitle)}>{title}</h3>
      {children}
    </section>
  );
}

function ThemeStep({
  appearance,
  wallpaper,
  layoutMode,
  onLayoutMode,
  t,
  track,
}: {
  appearance: Appearance;
  wallpaper?: Wallpaper | undefined;
  layoutMode?: LayoutMode | undefined;
  onLayoutMode(mode: LayoutMode): void;
  t: BotHarnessTranslate;
  track(setting: 'scheme' | 'preset' | 'layout' | 'wallpaper'): void;
}): ReactElement {
  const theme = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot);
  const media = useSyncExternalStore(wallpaper?.subscribe ?? noSubscribe, () =>
    wallpaper?.getSnapshot(),
  );
  const change = (patch: AppearancePatch) => {
    try {
      appearance.update(patch);
    } catch {}
  };
  return (
    <>
      <h2 {...stylex.props(styles.title)}>{t('intro.theme.title')}</h2>
      {theme.error ? <Note tone="danger">{t('appearance.saveFailed')}</Note> : null}
      <Section title={t('intro.theme.scheme')}>
        <ColorSchemePicker
          value={theme.config.preference}
          config={theme.config}
          onChange={(preference) => {
            change({ preference });
            track('scheme');
          }}
          t={t}
        />
      </Section>
      <Section title={t('intro.theme.color')}>
        <ThemePresetPicker
          config={theme.config}
          onSelect={(preset) => {
            applyPreset(appearance, preset);
            track('preset');
          }}
          t={t}
        />
      </Section>
      {layoutMode ? (
        <Section title={t('workspace.layoutMode')}>
          <LayoutModePicker
            value={layoutMode}
            onChange={(mode) => {
              onLayoutMode(mode);
              track('layout');
            }}
            t={t}
          />
          <p {...stylex.props(styles.layoutHint)}>
            {t(
              layoutMode === 'simple'
                ? 'onboarding.short.layoutSimpleHint'
                : 'onboarding.short.layoutAdvancedHint',
            )}
          </p>
        </Section>
      ) : null}
      {wallpaper ? (
        <Section title={t('intro.theme.wallpaper')}>
          <WallpaperLibrary
            owner={wallpaper}
            t={t}
            appearance={appearance}
            size="large"
            onChange={() => track('wallpaper')}
          />
        </Section>
      ) : null}
      {media?.current ? (
        <Section title={t('intro.theme.panels')}>
          <Note>{t('intro.theme.panelsHint')}</Note>
          <AppearanceMaterialSettings appearance={appearance} snapshot={theme} t={t} />
        </Section>
      ) : null}
    </>
  );
}

interface ModelStepBinding {
  keyForm: boolean;
  canAdvance: boolean;
  save(): Promise<boolean>;
}

interface ModelStepDraft {
  route?: ModelRouteView | undefined;
  subscription?: SubscriptionModel | null;
  assignment?: ModelRouteView | undefined;
  advanced: boolean;
}

const EMPTY_MODEL_DRAFT: ModelStepDraft = { advanced: false };

function ModelStep({
  actions,
  call,
  member,
  t,
  draft: [{ route: draftRoute, subscription, assignment, advanced }, setDraft],
  bind,
  saving,
  onProviderSavingChange,
  openProviders,
}: {
  actions: BridgeActions;
  call: BridgeCall | undefined;
  member: boolean;
  t: BotHarnessTranslate;
  draft: [ModelStepDraft, Dispatch<SetStateAction<ModelStepDraft>>];
  bind(model: ModelStepBinding | undefined): void;
  saving: boolean;
  onProviderSavingChange(saving: boolean): void;
  openProviders: (() => void) | undefined;
}): ReactElement {
  const viewerRead = useTeamModeRead(call);
  const viewer = viewerRead.value?.viewer;
  const [retryingViewer, setRetryingViewer] = useState(false);
  const owner = call === undefined ? !member : viewer?.owner;
  const canConnect = canManageModelProviders(viewer);
  const engines = useSubscriptionEngines(viewer?.owner === true);
  const [catalog, setCatalog] = useState<ModelCatalogView>();
  const [planned, setPlanned] = useState<string>();
  const [connection, setConnection] = useState<'key' | 'subscription'>();
  const [readError, setReadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const editingKey = canConnect && connection === 'key' && call !== undefined;
  const reload = () => setRefresh((count) => count + 1);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    const stop = observeResource(
      'model-providers',
      async () => {
        try {
          const next = await actions.modelCatalog();
          if (active) {
            setCatalog(next);
            setReadError(undefined);
          }
        } catch (cause) {
          if (active) setReadError(errorMessage(cause));
        }
      },
      undefined,
      undefined,
      true,
    );
    return () => {
      active = false;
      stop();
    };
  }, [actions, refresh]);

  const models = (catalog?.models ?? []).filter((model) => model.credential === undefined);
  const usableRoute = (route: ModelRouteView | undefined): ModelRouteView | undefined => {
    if (route === undefined) return undefined;
    const entry = models.find(
      (model) => model.provider === route.provider && model.model === route.model,
    );
    if (entry === undefined || entry.restingUntil !== undefined) return undefined;
    return route.reasoningEffort === undefined ||
      entry.efforts.some(({ id }) => id === route.reasoningEffort)
      ? route
      : { provider: route.provider, model: route.model };
  };
  const first = models.find((model) => model.restingUntil === undefined);
  const route =
    usableRoute(draftRoute) ??
    usableRoute(catalog?.default) ??
    (first === undefined ? undefined : { provider: first.provider, model: first.model });
  const tob = onboardingFor(actions).getSnapshot().receipt?.defaultBotSlug;
  const availableEngines = owner
    ? (engines.view?.engines.filter((engine) => engine.available) ?? [])
    : [];
  const savedEngine = engines.view?.selections.find(
    (choice) => choice.botSlug === tob && choice.role === 'orchestrator',
  );
  const [firstEngine] = availableEngines;
  const subscriptionKey = (choice: SubscriptionModel) =>
    engineModelKey(choice.engine, choice.accountId);
  const draftEngine =
    subscription == null
      ? undefined
      : availableEngines.find((entry) => subscriptionKey(entry) === subscriptionKey(subscription));
  const draftEngineModels =
    draftEngine === undefined ? undefined : engines.models[subscriptionKey(draftEngine)];
  const draftEngineModel = draftEngineModels?.find(({ id }) => id === subscription?.model);
  const unavailableSubscription =
    owner === true &&
    subscription != null &&
    engines.view !== undefined &&
    (draftEngine === undefined ||
      (subscription.model !== undefined &&
        draftEngineModels !== undefined &&
        draftEngineModel === undefined));
  const validatedSubscription =
    subscription && draftEngine && (subscription.model === undefined || draftEngineModel)
      ? {
          engine: subscription.engine,
          ...(subscription.accountId === undefined ? {} : { accountId: subscription.accountId }),
          ...(subscription.model === undefined ? {} : { model: subscription.model }),
          ...(subscription.effort !== undefined &&
          draftEngineModel?.efforts.some(({ id }) => id === subscription.effort)
            ? { effort: subscription.effort }
            : {}),
        }
      : owner
        ? subscription
        : undefined;
  const engineChoice: SubscriptionModel | null =
    validatedSubscription !== undefined
      ? validatedSubscription
      : savedEngine !== undefined &&
          availableEngines.some(
            (status) => subscriptionKey(status) === subscriptionKey(savedEngine),
          )
        ? savedEngine
        : route === undefined && firstEngine !== undefined
          ? {
              engine: firstEngine.engine,
              ...(firstEngine.accountId === undefined ? {} : { accountId: firstEngine.accountId }),
            }
          : null;
  const waitingForEngineSelection =
    owner === true &&
    call !== undefined &&
    tob !== undefined &&
    subscription !== undefined &&
    (engines.view === undefined ||
      (draftEngine !== undefined &&
        subscription?.model !== undefined &&
        draftEngineModels === undefined));
  const availableAssignment = usableRoute(assignment);
  const invalidAssignment =
    advanced &&
    assignment !== undefined &&
    catalog !== undefined &&
    (availableAssignment === undefined ||
      availableAssignment.reasoningEffort !== assignment.reasoningEffort);
  const waitingForCatalog =
    catalog === undefined && (draftRoute !== undefined || (advanced && assignment !== undefined));
  const canAdvance =
    owner === false ||
    (owner === true &&
      !unavailableSubscription &&
      (editingKey ||
        (!waitingForEngineSelection &&
          (engineChoice !== null || (!waitingForCatalog && !invalidAssignment)))));
  const hasUsableProvider = route !== undefined || availableEngines.length > 0;
  const local =
    engines.view === undefined
      ? undefined
      : engines.view.engines.some(
          (status) => status.available || status.reason !== 'host-not-local',
        );
  const split =
    advanced && assignment !== undefined && route !== undefined
      ? routeKey(assignment) !== routeKey(route) ||
        (assignment.reasoningEffort ?? '') !== (route.reasoningEffort ?? '')
      : false;

  const save = async (): Promise<boolean> => {
    if (!canAdvance) return false;
    if (!owner || connection === 'key') return true;
    setSaveError(undefined);
    try {
      if (engineChoice !== null) {
        if (
          tob !== undefined &&
          (savedEngine === undefined ||
            subscriptionKey(engineChoice) !== subscriptionKey(savedEngine) ||
            engineChoice.model !== savedEngine?.model ||
            engineChoice.effort !== savedEngine?.effort)
        ) {
          await engines.saveSelection(tob, 'orchestrator', engineChoice);
          onboardingFor(actions).introEvent('onboarding:model_save', { is_advanced: false });
        }
        return true;
      }
      if (route === undefined) return true;
      const plan = split && assignment ? JSON.stringify([route, assignment]) : undefined;
      const initial = catalog?.default;
      const changedDefault =
        initial === undefined ||
        routeKey(initial) !== routeKey(route) ||
        (initial.reasoningEffort ?? '') !== (route.reasoningEffort ?? '');
      if (changedDefault) {
        await actions.onboardingModel(undefined, 0, route, true);
        invalidateInheritedModelPlans(actions);
        setCatalog((previous) =>
          previous === undefined ? previous : { ...previous, default: route },
        );
        setPlanned(undefined);
      }
      if (tob !== undefined && savedEngine !== undefined && subscription === null) {
        await engines.saveSelection(tob, 'orchestrator', null);
      }
      if (tob !== undefined && plan !== planned) {
        const revision = (await actions.modelPlanState(tob)).revision ?? 0;
        if (split && assignment) {
          const effort = assignment.reasoningEffort ?? '';
          await actions.setModelPlan(tob, revision, route, assignment, [
            {
              provider: assignment.provider,
              model: assignment.model,
              allowedEfforts: [effort],
              defaultEffort: effort,
            },
          ]);
        } else await actions.inheritModel(tob, revision);
        setPlanned(plan);
      }
      if (changedDefault || (tob !== undefined && plan !== planned))
        onboardingFor(actions).introEvent('onboarding:model_save', { is_advanced: split });
      return true;
    } catch (cause) {
      setSaveError(errorMessage(cause));
      return false;
    }
  };
  const bindSave = useMountedResource<HTMLSpanElement>(() => {
    bind({ keyForm: editingKey, canAdvance, save });
    return () => bind(undefined);
  }, [
    owner,
    canAdvance,
    editingKey,
    connection,
    route?.provider,
    route?.model,
    route?.reasoningEffort,
    catalog?.default,
    assignment,
    advanced,
    planned,
    engineChoice?.engine,
    engineChoice?.model,
    engineChoice?.effort,
    savedEngine,
    subscription,
    tob,
  ]);
  const options = models.map((model) => ({
    value: routeKey(model),
    label: model.modelName,
    hint: model.providerName,
    disabled: model.restingUntil !== undefined,
  }));
  const parse = ({ key, effort }: { key: string; effort: string }): ModelRouteView | undefined => {
    const model = models.find((entry) => routeKey(entry) === key);
    return model === undefined
      ? undefined
      : {
          provider: model.provider,
          model: model.model,
          ...(effort ? { reasoningEffort: effort } : {}),
        };
  };
  const connected = new Map(
    models.map(({ provider, providerName }) => [
      provider,
      { name: providerName, brand: providerBrand(provider, providerName) },
    ]),
  );
  for (const status of availableEngines) {
    connected.set(`engine:${status.engine}`, {
      name: engineName(status.engine),
      brand: status.engine === 'codex' ? 'openai' : 'claude',
    });
  }
  return (
    <div
      ref={mount}
      className={`bh-onboarding-model-form ${stylex.props(styles.modelForm).className ?? ''}`}
    >
      <span ref={bindSave} hidden />
      <div ref={engines.mount} hidden />
      <h2 {...stylex.props(styles.title)}>
        {t(
          editingKey || !hasUsableProvider
            ? 'intro.model.connectTitle'
            : engineChoice !== null
              ? 'intro.model.tobModel'
              : owner === false
                ? 'intro.model.memberTitle'
                : 'intro.model.title',
        )}
      </h2>
      {editingKey ? (
        <InlineModelProvider
          call={call}
          onSavingChange={onProviderSavingChange}
          onClose={() => setConnection(undefined)}
          onAdded={() => {
            setConnection(undefined);
            reload();
          }}
          t={t}
        />
      ) : hasUsableProvider ? (
        <>
          <ModelPicker
            title={t('onboarding.model')}
            hint={
              engineChoice !== null
                ? t('intro.model.subscriptionHint')
                : owner
                  ? t('intro.model.hint')
                  : ''
            }
            choice={{ key: route ? routeKey(route) : '', effort: route?.reasoningEffort ?? '' }}
            catalog={models}
            options={options}
            onChange={(choice) =>
              setDraft((previous) => ({ ...previous, route: parse(choice), subscription: null }))
            }
            disabled={saving}
            subscription={
              (availableEngines.length === 0 && engineChoice === null) || tob === undefined
                ? undefined
                : {
                    choice: engineChoice,
                    items: engineMenuItems(availableEngines, engines.models, engines.signingIn, t),
                    models: engines.models,
                    onChange: (choice) =>
                      setDraft((previous) => ({ ...previous, subscription: choice })),
                    signIn: engines.signIn,
                  }
            }
            t={t}
          />
          {owner && engineChoice === null && tob !== undefined ? (
            <details
              {...stylex.props(styles.advanced)}
              open={advanced}
              onToggle={(event) => {
                const { open } = event.currentTarget;
                setDraft((previous) =>
                  previous.advanced === open ? previous : { ...previous, advanced: open },
                );
              }}
              data-intro-model-advanced
            >
              <summary
                {...stylex.props(styles.advancedSummary)}
                aria-disabled={saving || undefined}
                onClick={saving ? (event) => event.preventDefault() : undefined}
              >
                <span>{t('intro.model.advanced')}</span>
                <span {...stylex.props(styles.copy)}>
                  {t(split ? 'intro.model.advancedSplit' : 'intro.model.advancedSame')}
                </span>
              </summary>
              <ModelPicker
                title={t('modelPreset.assignment')}
                hint={t('intro.model.assignmentHint')}
                choice={{
                  key: routeKey(assignment ?? route ?? { provider: '', model: '' }),
                  effort: (assignment ?? route)?.reasoningEffort ?? '',
                }}
                catalog={models}
                options={options}
                onChange={(choice) =>
                  setDraft((previous) => ({ ...previous, assignment: parse(choice) }))
                }
                disabled={saving}
                t={t}
              />
            </details>
          ) : null}
          {canConnect && openProviders !== undefined ? (
            <div {...stylex.props(styles.choices)}>
              <ChoiceButton
                title={t('botSettings.section.modelProviders')}
                leading={<Icon name="settings" />}
                description={
                  <span {...stylex.props(styles.providers)}>
                    {[...connected].slice(0, 3).map(([id, { name, brand }]) => (
                      <span key={id} {...stylex.props(styles.provider)}>
                        <ModelBrandIcon brand={brand} />
                        {name}
                      </span>
                    ))}
                    {connected.size > 3 ? <span>+{connected.size - 3}</span> : null}
                  </span>
                }
                disabled={saving}
                onClick={openProviders}
              />
            </div>
          ) : null}
          {engines.loadFailed ? (
            <ReadFailure retryLabel={t('engine.reload')} onRetry={() => void engines.refresh()}>
              {t('engine.loadFailed')}
            </ReadFailure>
          ) : null}
        </>
      ) : catalog === undefined ? (
        readError === undefined ? (
          <Note>{t('modelPreset.loading')}</Note>
        ) : null
      ) : canConnect ? (
        <div {...stylex.props(styles.choices)}>
          <ChoiceButton
            title={t('intro.model.enterKey')}
            description={t('intro.model.enterKeyHint')}
            leading={<Icon name="shield-check" />}
            disabled={saving}
            onClick={() => setConnection('key')}
          />
          {local === true ? (
            connection === 'subscription' ? (
              <ModelProviderSubscriptions engines={engines} t={t} />
            ) : (
              <ChoiceButton
                title={t('intro.model.signIn')}
                description={t('intro.model.signInHint')}
                leading={<Icon name="plug" />}
                disabled={saving}
                onClick={() => setConnection('subscription')}
              />
            )
          ) : local === false ? (
            <Note>{t('engine.localOnly')}</Note>
          ) : null}
          {engines.loadFailed ? (
            <ReadFailure retryLabel={t('engine.reload')} onRetry={() => void engines.refresh()}>
              {t('engine.loadFailed')}
            </ReadFailure>
          ) : null}
        </div>
      ) : viewer !== undefined ? (
        <Note>{t('intro.model.ownerConnects')}</Note>
      ) : null}
      {call !== undefined && viewerRead.failed ? (
        <ReadFailure
          retryLabel={t('team.retry')}
          busy={retryingViewer}
          onRetry={() => {
            setRetryingViewer(true);
            void refreshTeamMode(call).finally(() => setRetryingViewer(false));
          }}
        >
          {t('intro.model.viewerLoadFailed')}
        </ReadFailure>
      ) : null}
      {readError === undefined ? null : (
        <ReadFailure retryLabel={t('engine.reload')} onRetry={reload}>
          {readError}
        </ReadFailure>
      )}
      {!editingKey && owner && unavailableSubscription ? (
        <Note tone="danger">{t('intro.model.subscriptionUnavailable')}</Note>
      ) : null}
      {!editingKey && owner && engineChoice === null && invalidAssignment ? (
        <div>
          <Note tone="warning">{t('intro.model.assignmentUnavailable')}</Note>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setDraft((previous) => ({ ...previous, assignment: undefined }))}
          >
            {t('intro.model.useMainForAssignment')}
          </Button>
        </div>
      ) : null}
      {saveError === undefined ? null : <Note tone="danger">{saveError}</Note>}
    </div>
  );
}

function InlineModelProvider({
  call,
  onClose,
  onAdded,
  onSavingChange,
  t,
}: {
  call: BridgeCall;
  onClose(): void;
  onAdded(): void;
  onSavingChange(saving: boolean): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [view, setView] = useState<ModelProvidersView>();
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [retry, setRetry] = useState(0);
  const reload = () => {
    setFailed(false);
    setRefreshing(true);
    setRetry((count) => count + 1);
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    const request = new AbortController();
    void bridgeHost(call, request.signal)
      .call<ModelProvidersView>('modelProviders')
      .then(
        (result) => {
          if (request.signal.aborted) return;
          setView(result);
          setRefreshing(false);
        },
        () => {
          if (!request.signal.aborted) setFailed(true);
        },
      );
    return () => request.abort();
  }, [call, retry]);
  return (
    <div ref={mount}>
      {view?.revision !== undefined ? (
        <AddModelProvider
          call={call}
          revision={refreshing ? undefined : view.revision}
          onAdded={onAdded}
          onClose={onClose}
          onConflict={reload}
          onSavingChange={onSavingChange}
          inline
          t={t}
        />
      ) : (
        <div {...stylex.props(styles.section)}>
          {view !== undefined ? (
            <Note>{t('modelProviders.readOnly')}</Note>
          ) : failed ? null : (
            <Note>{t('modelProviders.loading')}</Note>
          )}
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      {failed ? (
        <ReadFailure retryLabel={t('engine.reload')} onRetry={reload}>
          {t('modelProviders.readFailed')}
        </ReadFailure>
      ) : null}
    </div>
  );
}

function routeKey(route: { provider: string; model: string }): string {
  return JSON.stringify([route.provider, route.model]);
}

function CommunityStep({
  t,
  track,
}: {
  t: BotHarnessTranslate;
  track(target: 'github' | 'discord' | 'qq'): void;
}): ReactElement {
  const [stars, setStars] = useState(cachedGithubStars);
  const [copied, setCopied] = useState(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const abort = new AbortController();
    void fetchGithubStars(abort.signal).then((count) => {
      if (count !== undefined && !abort.signal.aborted) setStars(count);
    });
    return () => abort.abort();
  }, []);
  const locale = typeof navigator === 'undefined' ? 'en' : navigator.language;
  return (
    <div ref={mount} {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.heroCopy)}>
        <h2 {...stylex.props(styles.title)}>{t('intro.community.title')}</h2>
        <p {...stylex.props(styles.copy)}>{t('intro.community.hint')}</p>
      </div>
      <a
        href={COMMUNITY.github}
        target="_blank"
        rel="noopener noreferrer"
        {...stylex.props(styles.link)}
        data-community="github"
        onClick={() => track('github')}
      >
        <span {...stylex.props(styles.linkIcon)}>
          <CommunityIcon name="github" />
        </span>
        <span {...stylex.props(styles.linkText)}>
          <span {...stylex.props(styles.linkTitle)}>{t('intro.community.github')}</span>
          <span {...stylex.props(styles.copy)}>{t('intro.community.githubHint')}</span>
        </span>
        <span {...stylex.props(styles.stars)} data-github-stars={stars ?? ''}>
          <ChannelSidebarIcon name="star" size={14} />
          {stars === undefined
            ? t('intro.community.star')
            : t('intro.community.stars', { count: formatStars(stars, locale) })}
        </span>
      </a>
      <a
        href={COMMUNITY.discord}
        target="_blank"
        rel="noopener noreferrer"
        {...stylex.props(styles.link)}
        data-community="discord"
        onClick={() => track('discord')}
      >
        <span {...stylex.props(styles.linkIcon)}>
          <CommunityIcon name="discord" />
        </span>
        <span {...stylex.props(styles.linkText)}>
          <span {...stylex.props(styles.linkTitle)}>{t('intro.community.discord')}</span>
          <span {...stylex.props(styles.copy)}>{t('intro.community.discordHint')}</span>
        </span>
        <ChannelSidebarIcon name="external-link" size={16} />
      </a>
      <div {...stylex.props(styles.link, styles.still)} data-community="qq">
        <span {...stylex.props(styles.linkIcon)}>
          <CommunityIcon name="qq" />
        </span>
        <span {...stylex.props(styles.linkText)}>
          <span {...stylex.props(styles.linkTitle)}>{t('intro.community.qq')}</span>
          <span {...stylex.props(styles.copy)}>
            {t('intro.community.qqHint', { number: COMMUNITY.qqGroup })}
          </span>
        </span>
        <Button
          variant="outline"
          size="sm"
          {...stylex.props(styles.soft, styles.onCard)}
          onClick={() => {
            track('qq');
            void navigator.clipboard
              ?.writeText(COMMUNITY.qqGroup)
              .then(() => setCopied(true))
              .catch(() => {});
          }}
        >
          {t(copied ? 'intro.community.copied' : 'intro.community.copy')}
        </Button>
      </div>
      <Voices t={t} />
    </div>
  );
}

type StartPicks = {
  chosen: readonly OnboardingPersona[];
  details: readonly PersonaDetail[];
  tasks: boolean;
};
const NO_PICKS: StartPicks = { chosen: [], details: [], tasks: false };

function StartStep({
  t,
  picks,
  pick,
  track,
}: {
  t: BotHarnessTranslate;
  picks: readonly [StartPicks, (next: StartPicks) => void];
  pick(outcome: IntroStartOutcome, body?: string): void;
  track(choice: { persona: OnboardingPersona; detail?: PersonaDetail }): void;
}): ReactElement {
  const [{ chosen, details, tasks }, setPicks] = picks;
  const setChosen = (next: readonly OnboardingPersona[]) => setPicks({ ...picks[0], chosen: next });
  const setDetails = (next: readonly PersonaDetail[]) => setPicks({ ...picks[0], details: next });
  const setTasks = (next: boolean) => setPicks({ ...picks[0], tasks: next });
  const [timeZone] = useState(browserTimeZone);
  const personas = ONBOARDING_PERSONAS.filter((id) => chosen.includes(id));
  const profile = (): Pick<IntroStartOutcome, 'personas' | 'details'> => ({
    personas,
    details: details.filter((detail) =>
      personas.some((id) => (PERSONA_DETAILS[id] as readonly string[]).includes(detail)),
    ),
  });
  const about = (): string => {
    if (personas.length === 0) return '';
    const list = personas.map((id) => {
      const picked = PERSONA_DETAILS[id].filter((detail) => details.includes(detail));
      const name = t(`intro.persona.${id}.name`);
      return picked.length === 0
        ? name
        : t('intro.persona.aboutDetail', {
            persona: name,
            details: picked
              .map((detail) => t(`intro.persona.${id}.detail.${detail}` as BotHarnessKey))
              .join(t('intro.persona.aboutJoin')),
          });
    });
    return t('intro.persona.about', {
      list: list.join(t('intro.persona.aboutJoin')),
    });
  };
  const own = (
    <Button variant="ghost" onClick={() => pick({ starter: 'own', ...profile() })}>
      {t('intro.start.own')}
    </Button>
  );
  if (tasks && personas.length > 0) {
    const body = (persona: OnboardingPersona, prompt: PersonaPrompt): string => {
      const text = about() + t(`intro.persona.${persona}.${prompt.id}.body` as BotHarnessKey);
      if (prompt.feature !== 'schedule') return text;
      return (
        text +
        (timeZone ? t('intro.persona.timeZone', { timeZone }) : t('intro.persona.timeZoneUnknown'))
      );
    };
    return (
      <div {...stylex.props(styles.section)} data-intro-persona={personas.join(' ')}>
        <div {...stylex.props(styles.heroCopy)}>
          <h2 {...stylex.props(styles.title)}>
            {personas.length === 1
              ? t('intro.persona.promptsTitle', {
                  persona: t(`intro.persona.${personas[0]!}.name`),
                })
              : t('intro.persona.tasksTitle')}
          </h2>
          <p {...stylex.props(styles.copy)}>{t('intro.persona.promptsHint')}</p>
        </div>
        <div
          {...stylex.props(styles.starters, styles.wide)}
          role="list"
          aria-label={t('home.starters')}
        >
          {personas.flatMap((persona) =>
            PERSONA_TEMPLATES[persona].prompts.map((prompt) => (
              <div
                key={`${persona}.${prompt.id}`}
                role="listitem"
                {...stylex.props(styles.starterItem)}
              >
                <button
                  type="button"
                  data-persona-prompt={prompt.id}
                  onClick={() =>
                    pick(
                      {
                        starter: 'persona',
                        persona,
                        feature: prompt.feature,
                        ...profile(),
                      },
                      body(persona, prompt),
                    )
                  }
                  {...stylex.props(styles.link, styles.starter)}
                >
                  <span {...stylex.props(styles.linkIcon)}>
                    <ChannelSidebarIcon name={FEATURE_ICONS[prompt.feature]} size={18} />
                  </span>
                  <span {...stylex.props(styles.linkText)}>
                    <span {...stylex.props(styles.strong)}>
                      {t(`intro.persona.${persona}.${prompt.id}.title` as BotHarnessKey)}
                    </span>
                    <span {...stylex.props(styles.meta)}>
                      {personas.length === 1
                        ? t(`intro.feature.${prompt.feature}`)
                        : `${t(`intro.feature.${prompt.feature}`)} · ${t(`intro.persona.${persona}.name`)}`}
                    </span>
                  </span>
                  <ChannelSidebarIcon name="chevron-right" size={16} />
                </button>
              </div>
            )),
          )}
        </div>
        <div {...stylex.props(styles.personaActions)}>
          <Button variant="ghost" onClick={() => setTasks(false)}>
            {t('intro.persona.change')}
          </Button>
          {own}
        </div>
      </div>
    );
  }
  return (
    <div {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.heroCopy)}>
        <h2 {...stylex.props(styles.title)}>{t('intro.start.title')}</h2>
        <p {...stylex.props(styles.copy)}>{t('intro.start.hint')}</p>
      </div>
      <div {...stylex.props(styles.personas)} role="group" aria-label={t('intro.persona.label')}>
        {ONBOARDING_PERSONAS.map((id) => {
          const on = chosen.includes(id);
          return (
            <button
              key={id}
              type="button"
              data-persona={id}
              aria-pressed={on}
              onClick={() => {
                if (!on) track({ persona: id });
                setChosen(on ? chosen.filter((other) => other !== id) : [...chosen, id]);
              }}
              {...stylex.props(styles.link, styles.starter, styles.persona, on && styles.chosen)}
            >
              <span {...stylex.props(styles.linkIcon, on && styles.chosenIcon)}>
                <ChannelSidebarIcon name={on ? 'check' : PERSONA_TEMPLATES[id].icon} size={18} />
              </span>
              <span {...stylex.props(styles.linkText)}>
                <span {...stylex.props(styles.strong)}>{t(`intro.persona.${id}.name`)}</span>
                <span {...stylex.props(styles.meta)}>{t(`intro.persona.${id}.hint`)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {personas.map((id) => (
        <div
          key={id}
          role="group"
          aria-label={t('intro.persona.details', {
            persona: t(`intro.persona.${id}.name`),
          })}
          data-persona-details={id}
          {...stylex.props(styles.details)}
        >
          <span {...stylex.props(styles.meta)}>
            {t('intro.persona.details', {
              persona: t(`intro.persona.${id}.name`),
            })}
          </span>
          <div {...stylex.props(styles.chips)}>
            {PERSONA_DETAILS[id].map((detail: PersonaDetail) => {
              const on = details.includes(detail);
              return (
                <button
                  key={detail}
                  type="button"
                  data-persona-detail={detail}
                  aria-pressed={on}
                  onClick={() => {
                    if (!on) track({ persona: id, detail });
                    setDetails(
                      on ? details.filter((other) => other !== detail) : [...details, detail],
                    );
                  }}
                  {...stylex.props(styles.chip, on && styles.chosenChip)}
                >
                  {t(`intro.persona.${id}.detail.${detail}` as BotHarnessKey)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button
        type="button"
        data-intro-interview
        onClick={() =>
          pick(
            { starter: 'interview', ...profile() },
            about() +
              t('intro.interview.body') +
              (timeZone ? t('intro.interview.timeZone', { timeZone }) : ''),
          )
        }
        {...stylex.props(styles.link, styles.starter)}
      >
        <span {...stylex.props(styles.linkIcon, styles.interviewIcon)}>
          <ChannelSidebarIcon name="messages-square" size={18} />
        </span>
        <span {...stylex.props(styles.linkText)}>
          <span {...stylex.props(styles.strong)}>{t('intro.interview.title')}</span>
          <span {...stylex.props(styles.meta)}>{t('intro.interview.hint')}</span>
        </span>
        <ChannelSidebarIcon name="chevron-right" size={16} />
      </button>
      <div {...stylex.props(styles.personaActions)}>
        {own}
        <Button
          variant="primary"
          disabled={personas.length === 0}
          data-intro-persona-next
          onClick={() => setTasks(true)}
        >
          {t('intro.persona.next')}
        </Button>
      </div>
    </div>
  );
}
