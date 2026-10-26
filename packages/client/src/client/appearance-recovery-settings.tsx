import { useState, useSyncExternalStore } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ActionButton } from './ds/action-button.js';
import { AppearanceError, type Appearance } from './appearance.js';
import type { Wallpaper } from './wallpaper.js';
import type { BotHarnessTranslate } from './locale.js';
import { resetAppearance } from './appearance-recovery.js';
import { SettingsSection } from './ds/settings-row.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { space } from './ds/tokens.stylex.js';

const styles = stylex.create({
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x3,
    paddingTop: space.x3,
  },
});

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
      <SettingsSection
        title={t('recovery.title')}
        description={t('recovery.scope', {
          mode: t(snapshot.mode === 'light' ? 'settings.theme.light' : 'settings.theme.dark'),
        })}
      >
        {result && (
          <Note tone={result === 'partial' || result === 'failed' ? 'danger' : 'success'}>
            {t(`recovery.${result}`)}
          </Note>
        )}
        <div {...stylex.props(styles.actions)}>
          <ActionButton
            icon="refresh"

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
            {t('recovery.clear')}
          </ActionButton>
          <ActionButton
            icon="refresh"

            disabled={busy}
            onClick={() => {
              setResult(undefined);
              setConfirmation({
                appearance: appearance.getSnapshot().config.revision,
                wallpaper: wallpaper.getSnapshot().revision,
              });
            }}
          >
            {t('recovery.reset')}
          </ActionButton>
        </div>
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
