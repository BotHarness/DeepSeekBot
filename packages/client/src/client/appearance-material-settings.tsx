import type { Appearance, AppearanceSnapshot, AppearancePatch } from './appearance.js';
import { appearanceMaterials } from './appearance-materials.js';
import type { BotHarnessTranslate } from './locale.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { NumberStepper } from './ds/number-stepper.js';
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
  return (
    <SettingsSection
      title={t('appearance.panels')}
      description={t('appearance.materialMode', {
        mode: t(mode === 'light' ? 'settings.theme.light' : 'settings.theme.dark'),
      })}
    >
      {(['header', 'body'] as const).map((part) => (
        <SettingsSection
          key={part}
          title={t(part === 'header' ? 'appearance.header' : 'appearance.body')}
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
              <NumberStepper
                label={t(part === 'header' ? 'appearance.headerOpacity' : 'appearance.bodyOpacity')}
                value={materials[part].opacity}
                min={0}
                max={100}
                unit="%"
                decreaseLabel={t('common.decrease')}
                increaseLabel={t('common.increase')}
                onChange={(opacity) => change({ mode, materials: { [part]: { opacity } } })}
              />
            }
          />
          <SettingsRow
            title={t('appearance.materialBlur')}
            control={
              <NumberStepper
                label={t(part === 'header' ? 'appearance.headerBlur' : 'appearance.bodyBlur')}
                value={materials[part].blur}
                min={0}
                max={40}
                unit="px"
                decreaseLabel={t('common.decrease')}
                increaseLabel={t('common.increase')}
                onChange={(blur) => change({ mode, materials: { [part]: { blur } } })}
              />
            }
          />
        </SettingsSection>
      ))}
    </SettingsSection>
  );
}
