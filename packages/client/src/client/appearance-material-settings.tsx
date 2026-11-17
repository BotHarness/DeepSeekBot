import type { Appearance, AppearanceSnapshot, AppearancePatch } from './appearance.js';
import { appearanceMaterials } from './appearance-materials.js';
import type { BotHarnessTranslate } from './locale.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { Slider } from './ds/slider.js';
export function AppearanceMaterialSettings({
  appearance,
  snapshot,
  t,
}: {
  appearance: Appearance;
  snapshot: AppearanceSnapshot;
  t: BotHarnessTranslate;
}) {
  const mode = snapshot.mode;
  const materials = appearanceMaterials(snapshot.config.modes[mode], mode);
  const change = (patch: AppearancePatch) => {
    try {
      appearance.update(patch);
    } catch {}
  };
  const modeName = t(mode === 'light' ? 'settings.theme.light' : 'settings.theme.dark');
  return (
    <>
      {(['header', 'body'] as const).map((part) => (
        <SettingsSection
          key={part}
          title={t(part === 'header' ? 'appearance.header' : 'appearance.body')}
          description={t('appearance.materialMode', { mode: modeName })}
        >
          <SettingsRow
            title={t('appearance.materialColor')}
            control={
              <input
                type="color"
                aria-label={t(
                  part === 'header' ? 'appearance.headerColor' : 'appearance.bodyColor',
                )}
                value={materials[part].color}
                onChange={(event) =>
                  change({ mode, materials: { [part]: { color: event.currentTarget.value } } })
                }
              />
            }
          />
          <SettingsRow
            title={t('appearance.materialOpacity')}
            control={
              <Slider
                label={t(part === 'header' ? 'appearance.headerOpacity' : 'appearance.bodyOpacity')}
                value={materials[part].opacity}
                min={0}
                max={100}
                unit="%"
                onChange={(opacity) => change({ mode, materials: { [part]: { opacity } } })}
              />
            }
          />
          <SettingsRow
            title={t('appearance.materialBlur')}
            control={
              <Slider
                label={t(part === 'header' ? 'appearance.headerBlur' : 'appearance.bodyBlur')}
                value={materials[part].blur}
                min={0}
                max={40}
                unit="px"
                onChange={(blur) => change({ mode, materials: { [part]: { blur } } })}
              />
            }
          />
        </SettingsSection>
      ))}
    </>
  );
}
