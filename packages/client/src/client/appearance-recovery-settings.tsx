import { useState, useSyncExternalStore } from 'react';
import { ActionButton } from './ds/action-button.js';
import { AppearanceError, type Appearance } from './appearance.js';
import type { Wallpaper } from './wallpaper.js';
import type { BotHarnessTranslate } from './locale.js';
import { resetAppearance } from './appearance-recovery.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { Button } from './ds/button.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';

export function AppearanceRecoverySettings({
  appearance,
  wallpaper,
  t,
}: {
  appearance: Appearance;
  wallpaper: Wallpaper;
  t: BotHarnessTranslate;
}) {
  const snapshot = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot);
  const [confirmation, setConfirmation] = useState<{ appearance: string; wallpaper: string }>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'done' | 'cleared' | 'partial' | 'failed'>();
  return (
    <>
      <SettingsSection title={t('recovery.title')}>
        <SettingsRow
          title={t('recovery.clear')}
          description={t('recovery.scope', {
            mode: t(snapshot.mode === 'light' ? 'settings.theme.light' : 'settings.theme.dark'),
          })}
          control={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                try {
                  appearance.update(
                    { mode: snapshot.mode, clearPanels: true },
                    snapshot.config.revision,
                  );
                  setResult('cleared');
                } catch {
                  setResult('failed');
                }
              }}
            >
              {t('recovery.clearAction')}
            </Button>
          }
        >
          {result && (
            <Note tone={result === 'partial' || result === 'failed' ? 'danger' : 'success'}>
              {t(`recovery.${result}`)}
            </Note>
          )}
        </SettingsRow>
        <SettingsRow
          title={t('recovery.reset')}
          control={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setResult(undefined);
                setConfirmation({
                  appearance: appearance.getSnapshot().config.revision,
                  wallpaper: wallpaper.getSnapshot().revision,
                });
              }}
            >
              {t('recovery.resetAction')}
            </Button>
          }
        />
      </SettingsSection>
      {confirmation && (
        <PanelDialog
          title={t('recovery.confirmTitle')}
          closeLabel={t('common.close')}
          onClose={() => {
            if (!busy) setConfirmation(undefined);
          }}
          data={{ 'data-appearance-reset-confirmation': '' }}
          actions={
            <>
              <ActionButton icon="x" disabled={busy} onClick={() => setConfirmation(undefined)}>
                {t('common.cancel')}
              </ActionButton>
              <ActionButton
                icon="refresh"

                disabled={busy}
                tone="danger"
                busy={busy}
                onClick={() => {
                  setBusy(true);
                  void resetAppearance(
                    appearance,
                    wallpaper,
                    {
                      action: 'reset-all',
                      confirmed: true,
                      wallpaperRevision: confirmation.wallpaper,
                    },
                    confirmation.appearance,
                  )
                    .then(() => setResult('done'))
                    .catch((error) =>
                      setResult(
                        error instanceof AppearanceError &&
                          error.code === 'appearance-reset-wallpaper-failed'
                          ? 'partial'
                          : 'failed',
                      ),
                    )
                    .finally(() => {
                      setBusy(false);
                      setConfirmation(undefined);
                    });
                }}
              >
                {t('recovery.confirm')}
              </ActionButton>
            </>
          }
        >
          <Note>{t('recovery.confirmBody')}</Note>
        </PanelDialog>
      )}
    </>
  );
}
