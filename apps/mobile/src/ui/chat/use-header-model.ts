import { useMemo, useState, type RefCallback } from 'react';
import type { ViewInstance } from 'react-native';

import {
  botSettings,
  type BotModel,
  type BotSettings,
  type Loadable,
} from '@botharness/host-client/bot-settings';
import type { HostClient } from '@botharness/host-client/client';
import { useMounted } from '../mounted';
import { headerModel, type HeaderModel } from './composer-labels';

export function useHeaderModel(
  client: HostClient | undefined,
  slug: string | undefined,
  focused: boolean,
): { model: HeaderModel | undefined; mount: RefCallback<ViewInstance> } {
  const settings = useMemo(
    () => (client === undefined || slug === undefined ? undefined : botSettings(client, slug)),
    [client, slug],
  );
  const [state, setState] = useState<{ key: BotSettings; model: Loadable<BotModel> }>();
  const mount = useMounted<ViewInstance>(() => {
    if (settings === undefined || !focused) return;
    let current = true;
    void settings.loadModel().then(
      (value) => {
        if (current) setState({ key: settings, model: { status: 'ready', value } });
      },
      (error: unknown) => {
        if (current) setState({ key: settings, model: { status: 'failed', error: String(error) } });
      },
    );
    return () => {
      current = false;
    };
  }, [settings, focused]);
  return {
    model: state !== undefined && state.key === settings ? headerModel(state.model) : undefined,
    mount,
  };
}
