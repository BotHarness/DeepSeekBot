import { Button } from './ds/button.js';
import { useState, type ReactElement } from 'react';

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';

import { useMountedResource } from './mounted-resource.js';

export const DSH_BOT_SETTINGS_FALLBACK_MS = 800;

export type DshBotSettingsItemProps = PropsRuntime<'settings.section'> &
  PropsLocale<'botharness'> &
  InjectFace<{ openBotSettings(): void }>;

export function DshBotSettingsItem({
  close,
  openBotSettings,
  t,
}: DshBotSettingsItemProps): ReactElement {
  const [stalled, setStalled] = useState(false);
  const redirectToBotSettings = (): void => {
    close();
    openBotSettings();
  };
  const redirect = useMountedResource<HTMLDivElement>(() => {
    const fallback = setTimeout(() => {
      setStalled(true);
    }, DSH_BOT_SETTINGS_FALLBACK_MS);
    redirectToBotSettings();
    return () => {
      clearTimeout(fallback);
    };
  }, []);
  return (
    <div ref={redirect} className="bh-settings-rows">
      {stalled ? (
        <div className="bh-settings-row">
          <div className="bh-settings-row-text">
            <div className="bh-settings-row-desc">{t('settings.moved')}</div>
          </div>
          <Button variant="outline" size="sm" onClick={redirectToBotSettings}>
            {t('settings.open')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
