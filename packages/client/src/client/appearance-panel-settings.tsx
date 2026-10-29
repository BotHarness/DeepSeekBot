import { useSyncExternalStore } from 'react';
import { ActionButton } from './ds/action-button.js';
import type { Appearance } from './appearance.js';
import { panelMaterials, type PanelMaterialPatch } from './appearance-panels.js';
import type { BotHarnessTranslate } from './locale.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { SettingsRows, SettingsRow, SettingsSection } from './ds/settings-row.js';
import { NumberStepper } from './ds/number-stepper.js';
import { Note } from './ds/note.js';
export function PanelAppearanceSettings({
  owner,
  id,
  label,
  t,
  onClose,
}: {
  owner: Appearance;
  id: string;
  label: string;
  t: BotHarnessTranslate;
  onClose(): void;
}) {
  const snapshot = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const { mode } = snapshot;
  const selected = snapshot.config.modes[mode];
  const materials = panelMaterials(selected, mode, id);
  const own = selected.panels?.[id];
  const change = (materials: PanelMaterialPatch) => {
    try {
      owner.update({ mode, panel: { id, materials } });
    } catch {}
  };
  return (
    <PanelDialog
      title={t('appearance.panelTitle', { name: label })}
      closeLabel={t('common.close')}
      onClose={onClose}
      scroll
      data={{ 'data-panel-appearance': id }}
      actions={
        <ActionButton
          icon="refresh"

          onClick={() => {
            try {
              owner.update({ mode, panel: { id, reset: true } });
            } catch {}
          }}
        >
          {t('appearance.resetPanel')}
        </ActionButton>
      }
    >
      <Note>
        {t('appearance.panelMode', {
          mode: t(mode === 'light' ? 'settings.theme.light' : 'settings.theme.dark'),
        })}
      </Note>
      {snapshot.error && (
        <Note tone="danger">
          {t(
            snapshot.error.startsWith('appearance-target-')
              ? 'appearance.targetUnavailable'
              : 'appearance.saveFailed',
          )}
        </Note>
      )}
      <SettingsRows>
        {(['header', 'body'] as const).map((part) => (
          <SettingsSection
            key={part}
            title={t(part === 'header' ? 'appearance.header' : 'appearance.body')}
          >
            {(['color', 'opacity', 'blur'] as const).map((field) => {
              const labelKey =
                part === 'header'
                  ? field === 'color'
                    ? 'appearance.headerColor'
                    : field === 'opacity'
                      ? 'appearance.headerOpacity'
                      : 'appearance.headerBlur'
                  : field === 'color'
                    ? 'appearance.bodyColor'
                    : field === 'opacity'
                      ? 'appearance.bodyOpacity'
                      : 'appearance.bodyBlur';
              const label = t(labelKey);
              const overridden = own?.[part]?.[field] !== undefined;
              return (
                <SettingsRow
                  key={field}
                  title={t(
                    field === 'color'
                      ? 'appearance.materialColor'
                      : field === 'opacity'
                        ? 'appearance.materialOpacity'
                        : 'appearance.materialBlur',
                  )}
                  description={t(
                    overridden ? 'appearance.overridden' : 'appearance.followingGlobal',
                  )}
                  control={
                    <>
                      {field === 'color' ? (
                        <input
                          type="color"
                          aria-label={label}
                          value={materials[part].color}
                          onChange={(event) =>
                            change({ [part]: { color: event.currentTarget.value } })
                          }
                        />
                      ) : (
                        <NumberStepper
                          label={label}
                          value={materials[part][field]}
                          min={0}
                          max={field === 'opacity' ? 100 : 40}
                          unit={field === 'opacity' ? '%' : 'px'}
                          decreaseLabel={t('common.decrease')}
                          increaseLabel={t('common.increase')}
                          onChange={(value) => change({ [part]: { [field]: value } })}
                        />
                      )}
                      <ActionButton
                        icon="refresh"
                        disabled={!overridden}
                        aria-label={t('appearance.followGlobalField', { field: label })}
                        onClick={() => change({ [part]: { [field]: null } })}
                      >
                        {t('appearance.followGlobal')}
                      </ActionButton>
                    </>
                  }
                />
              );
            })}
          </SettingsSection>
        ))}
      </SettingsRows>
    </PanelDialog>
  );
}
