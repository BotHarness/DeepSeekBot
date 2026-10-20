import { useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import { errorMessage, type ModelCatalogEntryView, type ModelRouteView } from './bridge.js';
import { BotIcon } from './bot-icon.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { IconButton } from './ds/icon-button.js';
import { Note } from './ds/note.js';
import { border, color, dialog, radius, size, space, text } from './ds/tokens.stylex.js';
import { Modal } from './modal.js';
import { ModelPicker } from './model-picker.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { openModelsSettingsAndReturn } from './bot-settings-open.js';
import type { Appearance, AppearancePatch } from './appearance.js';
import { AppearanceMaterialSettings } from './appearance-material-settings.js';
import { ColorSchemePicker, ThemePresetPicker, applyPreset } from './appearance-pickers.js';
import { WallpaperLibrary } from './wallpaper-library.js';
import type { Wallpaper } from './wallpaper.js';
import { CommunityIcon } from './community-icons.js';
import { COMMUNITY, cachedGithubStars, fetchGithubStars, formatStars } from './community-links.js';
import { requestHomeMessage } from './home-requests.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { INTRO_STEPS, onboardingFor, type IntroStarter } from './onboarding.js';
import { invalidateInheritedModelPlans } from './model-plan-store.js';

export { INTRO_STEPS };
export type IntroStep = (typeof INTRO_STEPS)[number];

const REVIEWS: readonly BotHarnessKey[] = [
  'intro.reviews.clean',
  'intro.reviews.era',
  'intro.reviews.details',
];

const STARTERS: readonly { key: BotHarnessKey; id: IntroStarter }[] = [
  { key: 'onboarding.short.botPrompt', id: 'botPrompt' },
  { key: 'onboarding.firstRequest', id: 'firstRequest' },
  { key: 'onboarding.exampleRequest', id: 'exampleRequest' },
];

const styles = stylex.create({
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
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
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
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.divider,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  advanced: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    padding: space.x4,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.divider,
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
  signature: { margin: 0, alignSelf: 'flex-end', color: color.muted, fontSize: text.bodySize },
  section: { display: 'flex', flexDirection: 'column', gap: space.x4, minWidth: 0 },
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
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: { default: color.border, ':hover': color.borderStrong },
    borderRadius: radius.lg,
    color: color.fg,
    textDecoration: 'none',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
  linkIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size.nav,
    height: size.nav,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    color: color.fg,
  },
  linkText: { display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 },
  linkTitle: { fontWeight: text.strong, fontSize: text.titleSize, lineHeight: text.titleLine },
  stars: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    flexShrink: 0,
    paddingInline: space.x4,
    height: size.icon,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
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
  starter: {
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: 'pointer',
  },
});

export function BotIntro({
  actions,
  appearance,
  wallpaper,
  t,
}: {
  actions: BridgeActions;
  appearance?: Appearance | undefined;
  wallpaper?: Wallpaper | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const controller = onboardingFor(actions);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const media = useSyncExternalStore(wallpaper?.subscribe ?? noSubscribe, () =>
    wallpaper?.getSnapshot(),
  );
  const intro = state.intro;
  const [model, setModel] = useState<{ save(): Promise<boolean> }>();
  const [busy, setBusy] = useState(false);
  if (!intro) return null;
  const step = INTRO_STEPS[intro.step] ?? 'welcome';
  const last = intro.step === INTRO_STEPS.length - 1;
  const clear = step === 'theme' && media?.current !== undefined;
  const go = async (next: number) => {
    if (next > intro.step && step === 'model' && model) {
      setBusy(true);
      const saved = await model.save().finally(() => setBusy(false));
      if (!saved) return;
    }
    controller.setIntroStep(next);
  };
  return (
    <Modal
      open={!intro.hidden}
      headless
      title={t('intro.title')}
      onClose={() => void controller.closeIntro({ via: 'close' })}
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
                aria-current={index === intro.step ? 'step' : undefined}
                disabled={busy}
                onClick={() => void go(index)}
                {...stylex.props(styles.stepButton, index === intro.step && styles.stepCurrent)}
              >
                <span
                  {...stylex.props(styles.stepDot, index <= intro.step && styles.stepDotActive)}
                >
                  {index < intro.step ? <ChannelSidebarIcon name="check" size={14} /> : index + 1}
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
          onClick={() => void controller.closeIntro({ via: 'close' })}
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
            t={t}
            track={(setting) => controller.introEvent('intro_theme_changed', { setting })}
          />
        ) : null}
        {step === 'model' ? (
          <ModelStep
            actions={actions}
            t={t}
            bind={setModel}
            hide={(hidden) => controller.hideIntro(hidden)}
          />
        ) : null}
        {step === 'community' ? (
          <CommunityStep
            t={t}
            track={(target) => controller.introEvent('intro_community_clicked', { target })}
          />
        ) : null}
        {step === 'start' ? (
          <StartStep
            t={t}
            pick={(starter, body) =>
              void controller.closeIntro({ starter }).then(() => {
                if (body !== undefined) requestHomeMessage(body);
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
        {last ? null : (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void controller.closeIntro({ via: 'skip' })}
          >
            {t('intro.skip')}
          </Button>
        )}
        {intro.step > 0 ? (
          <Button variant="outline" disabled={busy} onClick={() => void go(intro.step - 1)}>
            {t('intro.back')}
          </Button>
        ) : null}
        {last ? null : (
          <Button
            variant="primary"
            data-modal-autofocus
            disabled={busy}
            onClick={() => void go(intro.step + 1)}
          >
            {t('intro.next')}
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
  t,
  track,
}: {
  appearance: Appearance;
  wallpaper?: Wallpaper | undefined;
  t: BotHarnessTranslate;
  track(setting: 'scheme' | 'preset' | 'wallpaper'): void;
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

function ModelStep({
  actions,
  t,
  bind,
  hide,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
  bind(model: { save(): Promise<boolean> } | undefined): void;
  hide(hidden: boolean): void;
}): ReactElement {
  const [models, setModels] = useState<ModelCatalogEntryView[]>([]);
  const [route, setRoute] = useState<ModelRouteView>();
  const [assignment, setAssignment] = useState<ModelRouteView>();
  const [advanced, setAdvanced] = useState(false);
  const [planned, setPlanned] = useState<string>();
  const [initial, setInitial] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const load = async (): Promise<void> => {
    setError(undefined);
    try {
      const catalog = await actions.modelCatalog();
      setModels(catalog.models);
      const usable = catalog.models.find((model) => model.credential === undefined);
      const selected =
        catalog.default ??
        (usable ? { provider: usable.provider, model: usable.model } : undefined);
      setRoute((previous) => previous ?? selected);
      setInitial(catalog.default ? routeKey(catalog.default) : undefined);
      setLoaded(true);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    void load();
  }, [actions]);
  const selected = models.find(
    (model) => model.provider === route?.provider && model.model === route.model,
  );
  const tob = onboardingFor(actions).getSnapshot().receipt?.defaultBotSlug;
  const split =
    advanced && assignment !== undefined && route !== undefined
      ? routeKey(assignment) !== routeKey(route) ||
        (assignment.reasoningEffort ?? '') !== (route.reasoningEffort ?? '')
      : false;
  const save = async (): Promise<boolean> => {
    if (!route || !selected || selected.credential !== undefined) return true;
    const plan = split && assignment ? JSON.stringify([route, assignment]) : undefined;
    const changed =
      initial !== routeKey(route) ||
      route.reasoningEffort !== undefined ||
      (tob !== undefined && plan !== planned);
    try {
      if (initial !== routeKey(route) || route.reasoningEffort !== undefined) {
        await actions.onboardingModel(undefined, 0, route, true);
        invalidateInheritedModelPlans();
        setInitial(routeKey(route));
        setPlanned(undefined);
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
      if (changed) onboardingFor(actions).introEvent('intro_model_saved', { advanced: split });
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  };
  const bound = useMountedResource<HTMLSpanElement>(() => {
    bind({ save });
    return () => bind(undefined);
  }, [route, selected, initial, assignment, advanced, planned]);
  const options = models.map((model) => ({
    value: routeKey(model),
    label: model.modelName,
    hint: model.providerName + (model.credential ? ' · ' + t('onboarding.needsKey') : ''),
  }));
  const parse = ({ key, effort }: { key: string; effort: string }): ModelRouteView => {
    const [provider, model] = JSON.parse(key) as [string, string];
    return { provider, model, ...(effort ? { reasoningEffort: effort } : {}) };
  };
  return (
    <div ref={mount} className="bh-onboarding-model-form">
      <span ref={bound} hidden />
      <h2 {...stylex.props(styles.title)}>{t('intro.model.title')}</h2>
      <ModelPicker
        title={t('onboarding.model')}
        hint={t('intro.model.hint')}
        choice={{
          key: route ? routeKey(route) : '',
          effort: route?.reasoningEffort ?? '',
        }}
        catalog={models}
        options={options}
        onChange={(choice) => setRoute(parse(choice))}
        disabled={false}
        t={t}
      />
      {tob !== undefined ? (
        <details
          {...stylex.props(styles.advanced)}
          open={advanced}
          onToggle={(event) => setAdvanced(event.currentTarget.open)}
          data-intro-model-advanced
        >
          <summary {...stylex.props(styles.advancedSummary)}>
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
            onChange={(choice) => setAssignment(parse(choice))}
            disabled={false}
            t={t}
          />
        </details>
      ) : null}
      {!loaded ? <p role="status">{t('modelPreset.loading')}</p> : null}
      <SidebarCardList label={t('failure.openModels')}>
        <SidebarCardRow
          icon="settings"
          title={t('failure.openModels')}
          meta={
            selected?.credential || (loaded && models.length === 0)
              ? t('onboarding.keyHint')
              : t('onboarding.providerSettingsHint')
          }
          onClick={() => {
            hide(true);
            openModelsSettingsAndReturn(() => {
              hide(false);
              void load();
            });
          }}
        />
      </SidebarCardList>
      {error ? (
        <p role="alert" className="bh-error">
          {error}
        </p>
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
      <div {...stylex.props(styles.link)} data-community="qq">
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

function StartStep({
  t,
  pick,
}: {
  t: BotHarnessTranslate;
  pick(starter: IntroStarter, body?: string): void;
}): ReactElement {
  return (
    <div {...stylex.props(styles.hero)}>
      <BotIcon icon="mascot" size={96} />
      <div {...stylex.props(styles.heroCopy)}>
        <h2 {...stylex.props(styles.title)}>{t('intro.start.title')}</h2>
        <p {...stylex.props(styles.copy)}>{t('intro.start.hint')}</p>
      </div>
      <div {...stylex.props(styles.starters)} role="list" aria-label={t('home.starters')}>
        {STARTERS.map(({ key, id }) => (
          <div key={key} role="listitem" {...stylex.props(styles.starterItem)}>
            <button
              type="button"
              onClick={() => pick(id, t(key))}
              {...stylex.props(styles.link, styles.starter)}
            >
              <span {...stylex.props(styles.linkIcon)}>
                <ChannelSidebarIcon name="messages-circle" size={18} />
              </span>
              <span {...stylex.props(styles.linkText)}>{t(key)}</span>
            </button>
          </div>
        ))}
      </div>
      <Button variant="ghost" onClick={() => pick('own')}>
        {t('intro.start.own')}
      </Button>
    </div>
  );
}
