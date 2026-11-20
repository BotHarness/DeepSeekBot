import { useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Note } from './ds/note.js';
import { color, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
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
import { styles as stepStyles } from './bot-intro-step-styles.js';

const styles = stylex.create({
  layoutHint: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

export const noSubscribe = () => () => {};

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section {...stylex.props(stepStyles.section)} aria-label={title}>
      <h3 {...stylex.props(stepStyles.sectionTitle)}>{title}</h3>
      {children}
    </section>
  );
}

export function ThemeStep({
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
      <h2 {...stylex.props(stepStyles.title)}>{t('intro.theme.title')}</h2>
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
