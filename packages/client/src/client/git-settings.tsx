import { useState, type ReactElement } from 'react';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import { loadGitAvailability, type BridgeCall, type GitAvailability } from './bridge.js';
import { useMountedResource } from './mounted-resource.js';
import { SettingsRow, SettingsValue } from './ds/settings-row.js';

export type GitSettingsProps = PropsLocale<'botharness'> & InjectFace<{ call: BridgeCall }>;

export function GitSettings({ call, t }: GitSettingsProps): ReactElement {
  const [git, setGit] = useState<GitAvailability>();
  const [error, setError] = useState(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    loadGitAvailability(call, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setGit(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [call]);
  const state =
    git === undefined
      ? error
        ? t('git.settings.error')
        : t('git.settings.loading')
      : git.available
        ? t(git.source === 'managed' ? 'git.settings.managed' : 'git.settings.system', {
            version: git.version,
          })
        : git.reason === 'too-old'
          ? t('git.settings.tooOld', { version: git.version ?? '?' })
          : t('git.settings.unavailable');
  return (
    <SettingsRow
      rootRef={mount}
      title={t('git.settings.title')}
      description={t('git.settings.description')}
      data={{
        'data-git-setting': git === undefined ? 'loading' : git.available ? git.source : git.reason,
      }}
      control={<SettingsValue>{state}</SettingsValue>}
    />
  );
}
