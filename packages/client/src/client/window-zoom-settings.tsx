import { useSyncExternalStore, type ReactElement } from 'react';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { PillButton } from './ds/pill-button.js';
import { Select } from './ds/select.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ZoomSurface } from './window-zoom-mount.js';
import { type WindowZoom, type ZoomOperation, ZOOM_LEVELS, zoomPercent } from './window-zoom.js';

export function WindowZoomSettings({
  surface,
  t,
}: {
  surface: ZoomSurface;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const owner = useSyncExternalStore(surface.subscribe, surface.getSnapshot);
  const error = useSyncExternalStore(surface.subscribe, surface.getErrorSnapshot);
  return owner ? (
    <ZoomRows owner={owner} t={t} />
  ) : error ? (
    <p role="alert">{t('zoom.unavailable')}</p>
  ) : null;
}
function ZoomRows({ owner, t }: { owner: WindowZoom; t: BotHarnessTranslate }): ReactElement {
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const level = state.document.primaryLevel;
  const act = (input: ZoomOperation) => {
    try {
      owner.execute(input);
    } catch {}
  };
  return (
    <SettingsSection>
      <SettingsRow
        title={t('zoom.current')}
        description={t('zoom.current.description')}
        control={
          <>
            <PillButton
              aria-label={t('zoom.decrease')}
              disabled={level <= -8}
              onClick={() => act({ type: 'step', delta: -1 })}
            >
              −
            </PillButton>
            <output aria-label={t('zoom.current')}>{zoomPercent(level)}</output>
            <PillButton
              aria-label={t('zoom.increase')}
              disabled={level >= 8}
              onClick={() => act({ type: 'step', delta: 1 })}
            >
              +
            </PillButton>
            <PillButton onClick={() => act({ type: 'reset' })}>{t('zoom.reset')}</PillButton>
          </>
        }
      />
      <SettingsRow
        title={t('zoom.default')}
        description={t('zoom.default.description')}
        control={
          <Select
            label={t('zoom.default')}
            value={String(state.document.defaultLevel)}
            options={ZOOM_LEVELS.map((value) => ({
              value: String(value),
              label: zoomPercent(value),
            }))}
            onChange={(value) => act({ type: 'default', level: Number(value) })}
          />
        }
      />
      <p>{t('zoom.numpadUnavailable')}</p>
      {state.error ? <p role="alert">{t('zoom.failed')}</p> : null}
    </SettingsSection>
  );
}
