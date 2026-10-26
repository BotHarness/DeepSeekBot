import { useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import type { LayoutMode } from './layout-mode.js';
import { onboardingFor } from './onboarding.js';
import { store } from './store.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.panel,
    padding: space.x4,
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
  },
  copy: { margin: 0, color: color.muted, fontSize: text.bodySize },
  actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x2 },
  choice: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: space.x2 },
});
export function TobOnboarding({
  actions,
  t,
  ready,
  hasDraft,
  suggest,
  openChannel,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
  ready: boolean;
  hasDraft: boolean;
  suggest(body: string): void;
  openChannel(id: string): void;
}): ReactElement | null {
  const controller = onboardingFor(actions);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const client = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const journey = state.receipt?.journey;
  if (!journey || journey.done || state.receipt?.tutorial !== 'active' || state.guideOpen)
    return null;
  const step = !ready
    ? 'model'
    : !journey.botSlug
      ? 'bot'
      : !journey.groupChannelId
        ? 'group'
        : state.layoutComplete
          ? 'chat'
          : 'layout';
  const number = ['model', 'bot', 'group', 'layout', 'chat'].indexOf(step) + 1;
  const mode = state.layoutMode;
  const hint =
    step === 'layout' && mode !== undefined
      ? 'onboarding.short.layoutChoose'
      : step === 'chat' && mode === 'simple'
        ? 'onboarding.short.chatHintSimple'
        : (`onboarding.short.${step}Hint` as const);
  const created = client.bots.find((bot) => bot.slug === journey.botSlug);
  const name = created?.displayName ?? journey.botSlug ?? '';
  const greet =
    journey.botSlug === undefined ? null : (
      <Button
        variant={step === 'group' ? 'primary' : 'ghost'}
        onClick={() => openChannel('dm-' + journey.botSlug)}
      >
        {t('onboarding.short.openBot', { name })}
      </Button>
    );
  return (
    <section
      {...stylex.props(styles.card)}
      aria-label={t('onboarding.short.title')}
      data-tob-onboarding
    >
      <div {...stylex.props(styles.heading)}>
        <strong>{t(`onboarding.short.${step}`)}</strong>
        <span {...stylex.props(styles.copy)}>
          {t('onboarding.short.progress', { done: String(number - 1) })}
        </span>
      </div>
      <p {...stylex.props(styles.copy)}>{t(hint, { name })}</p>
      {step === 'layout' && mode !== undefined ? (
        <div {...stylex.props(styles.choice)} data-onboarding-layout-mode>
          <SegmentedControl
            id="bh-onboarding-layout-mode"
            label={t('workspace.layoutMode')}
            value={mode}
            options={[
              { value: 'simple', label: t('workspace.layoutMode.simple') },
              { value: 'advanced', label: t('workspace.layoutMode.advanced') },
            ]}
            onChange={(next) => controller.chooseLayout(next as LayoutMode)}
          />
          <p {...stylex.props(styles.copy)}>
            {t(
              mode === 'simple'
                ? 'onboarding.short.layoutSimpleHint'
                : 'onboarding.short.layoutAdvancedHint',
            )}
          </p>
        </div>
      ) : null}
      {hasDraft && (step === 'bot' || step === 'group') ? (
        <p {...stylex.props(styles.copy)}>{t('onboarding.short.draft')}</p>
      ) : null}
      <div {...stylex.props(styles.actions)}>
        {step === 'group' ? greet : null}
        {step === 'model' || step === 'chat' ? null : step === 'layout' ? (
          <Button variant="ghost" onClick={() => void controller.startTour()}>
            {t(state.layoutComplete ? 'onboarding.restart' : 'onboarding.short.tour')}
          </Button>
        ) : (
          <Button
            variant={step === 'bot' ? 'primary' : 'ghost'}
            disabled={hasDraft || state.busy}
            onClick={() =>
              suggest(
                step === 'bot'
                  ? t('onboarding.short.botPrompt')
                  : t('onboarding.short.groupPrompt', { name }),
              )
            }
          >
            {t('onboarding.short.suggest')}
          </Button>
        )}
        {step === 'group' ? null : greet}
        {journey.groupChannelId ? (
          <Button variant="ghost" onClick={() => openChannel(journey.groupChannelId!)}>
            {t('onboarding.short.openGroup')}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => void controller.refresh(undefined, 'pause')}>
          {t('onboarding.short.pause')}
        </Button>
        <Button variant="ghost" onClick={() => controller.skipTutorial()}>
          {t('onboarding.short.skip')}
        </Button>
      </div>
    </section>
  );
}
